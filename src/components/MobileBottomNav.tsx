import React, { useState } from 'react';
import { 
  LayoutGrid, 
  Calendar as CalendarIcon, 
  Plus, 
  BarChart3, 
  User, 
  CheckSquare, 
  UserPlus, 
  Award, 
  Bell,
  X,
  Clock,
  Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

interface MobileBottomNavProps {
  activeView: string;
  onNavigate: (view: any) => void;
  onOpenQuickReminder?: () => void;
}

export function MobileBottomNav({
  activeView,
  onNavigate,
  onOpenQuickReminder
}: MobileBottomNavProps) {
  const { user } = useAuth();
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  return (
    <>
      {/* Floating Bottom Bar Container - visible on mobile and tablet (hidden on desktop or print) */}
      <div className="fixed bottom-3 inset-x-0 z-40 px-2 sm:px-4 flex justify-center pointer-events-none print:hidden lg:hidden">
        <div className="bg-white rounded-full shadow-lg border border-[#bac4c6] py-2 px-3 sm:px-5 flex items-center justify-around sm:justify-between gap-2 sm:gap-6 pointer-events-auto max-w-md w-full relative">
          
          {/* Tab 1: Dashboard */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className={cn(
              "flex flex-col items-center justify-center transition-all p-1.5 rounded-xl cursor-pointer relative min-h-[44px] min-w-[44px]",
              activeView === 'dashboard' ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
            )}
            title="Productivity Dashboard"
          >
            <LayoutGrid className="w-5 h-5" />
            {activeView === 'dashboard' && (
              <span className="w-1.5 h-1.5 bg-[#faae57] rounded-full absolute bottom-0.5" />
            )}
          </button>

          {/* Tab 2: Timetable / Schedule */}
          <button
            type="button"
            onClick={() => onNavigate('timetable')}
            className={cn(
              "flex flex-col items-center justify-center transition-all p-1.5 rounded-xl cursor-pointer relative min-h-[44px] min-w-[44px]",
              activeView === 'timetable' ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
            )}
            title="Schedule & Calendar"
          >
            <CalendarIcon className="w-5 h-5" />
            {activeView === 'timetable' && (
              <span className="w-1.5 h-1.5 bg-[#faae57] rounded-full absolute bottom-0.5" />
            )}
          </button>

          {/* Tab 3: Raised Center Floating Orange FAB Button (+) */}
          <div className="relative -mt-6">
            <button
              type="button"
              onClick={() => setShowQuickMenu(prev => !prev)}
              className={cn(
                "w-12 h-12 rounded-full bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] flex items-center justify-center shadow-lg border-4 border-white transition-all transform active:scale-95 cursor-pointer min-h-[48px] min-w-[48px]",
                showQuickMenu && "rotate-45 bg-[#1c4a59] text-white"
              )}
              title="Quick Actions"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
          </div>

          {/* Tab 4: Results / Exam Analysis */}
          <button
            type="button"
            onClick={() => onNavigate('results')}
            className={cn(
              "flex flex-col items-center justify-center transition-all p-1.5 rounded-xl cursor-pointer relative min-h-[44px] min-w-[44px]",
              activeView === 'results' || activeView === 'exam_analysis' ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
            )}
            title="Academic Results"
          >
            <BarChart3 className="w-5 h-5" />
            {(activeView === 'results' || activeView === 'exam_analysis') && (
              <span className="w-1.5 h-1.5 bg-[#faae57] rounded-full absolute bottom-0.5" />
            )}
          </button>

          {/* Tab 5: Profile / Settings */}
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={cn(
              "flex flex-col items-center justify-center transition-all p-1.5 rounded-xl cursor-pointer relative min-h-[44px] min-w-[44px]",
              activeView === 'settings' ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
            )}
            title="Profile & Settings"
          >
            <User className="w-5 h-5" />
            {activeView === 'settings' && (
              <span className="w-1.5 h-1.5 bg-[#faae57] rounded-full absolute bottom-0.5" />
            )}
          </button>

        </div>
      </div>

      {/* Quick Action Drawer / Menu */}
      <AnimatePresence>
        {showQuickMenu && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-slate-900/40 pb-20">
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 border border-[#bac4c6] shadow-xl max-w-sm w-full space-y-3 relative"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#bac4c6]">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6a7f84]">
                  Quick Actions
                </span>
                <button
                  type="button"
                  onClick={() => setShowQuickMenu(false)}
                  className="p-1.5 rounded-full hover:bg-[#f6f8f7] text-[#6a7f84] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {/* Take Attendance */}
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onNavigate('attendance');
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-[#06d6a0]/10 hover:bg-[#06d6a0]/20 border border-[#06d6a0]/30 text-[#1f2a2e] transition-all text-left min-h-[44px]"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#06d6a0] text-white flex items-center justify-center shrink-0">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold leading-tight">Take Attendance</h5>
                    <span className="text-[10px] text-[#059669]">Daily roll</span>
                  </div>
                </button>

                {/* Add Reminder */}
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    if (onOpenQuickReminder) {
                      onOpenQuickReminder();
                    } else {
                      onNavigate('timetable');
                    }
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-[#e1c594]/30 hover:bg-[#e1c594]/50 border border-[#e4ae67]/40 text-[#1f2a2e] transition-all text-left min-h-[44px]"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#faae57] text-[#1f2a2e] flex items-center justify-center shrink-0 font-bold">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold leading-tight">Set Reminder</h5>
                    <span className="text-[10px] text-[#807654]">Add to day</span>
                  </div>
                </button>

                {/* Record Fee */}
                {user?.role !== 'teacher' && user?.role !== 'student' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickMenu(false);
                      onNavigate('fees');
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-2xl bg-[#1c4a59]/10 hover:bg-[#1c4a59]/20 border border-[#1c4a59]/30 text-[#1f2a2e] transition-all text-left min-h-[44px]"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[#1c4a59] text-white flex items-center justify-center shrink-0">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold leading-tight">Record Fees</h5>
                      <span className="text-[10px] text-[#1c4a59]">MoMo / Cash</span>
                    </div>
                  </button>
                )}

                {/* Record Results */}
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onNavigate('results');
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-[#f6f8f7] hover:bg-white border border-[#bac4c6] text-[#1f2a2e] transition-all text-left min-h-[44px]"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#1c4a59] text-white flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold leading-tight">Enter Scores</h5>
                    <span className="text-[10px] text-[#6a7f84]">Term assess</span>
                  </div>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
