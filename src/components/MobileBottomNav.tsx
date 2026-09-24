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
        <div className="bg-white/95 backdrop-blur-md rounded-full shadow-2xl border border-slate-200/90 py-2 px-3 sm:px-5 flex items-center justify-around sm:justify-between gap-2 sm:gap-6 pointer-events-auto max-w-md w-full relative">
          
          {/* Tab 1: Dashboard */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className={cn(
              "flex flex-col items-center justify-center transition-all p-1.5 rounded-xl cursor-pointer relative",
              activeView === 'dashboard' ? "text-[#163840]" : "text-slate-400 hover:text-slate-700"
            )}
            title="Productivity Dashboard"
          >
            <LayoutGrid className="w-5 h-5" />
            {activeView === 'dashboard' && (
              <span className="w-1.5 h-1.5 bg-[#F6A854] rounded-full absolute -bottom-0.5" />
            )}
          </button>

          {/* Tab 2: Timetable / Schedule */}
          <button
            type="button"
            onClick={() => onNavigate('timetable')}
            className={cn(
              "flex flex-col items-center justify-center transition-all p-1.5 rounded-xl cursor-pointer relative",
              activeView === 'timetable' ? "text-[#163840]" : "text-slate-400 hover:text-slate-700"
            )}
            title="Schedule & Calendar"
          >
            <CalendarIcon className="w-5 h-5" />
            {activeView === 'timetable' && (
              <span className="w-1.5 h-1.5 bg-[#F6A854] rounded-full absolute -bottom-0.5" />
            )}
          </button>

          {/* Tab 3: Raised Center Floating Orange FAB Button (+) */}
          <div className="relative -mt-6">
            <button
              type="button"
              onClick={() => setShowQuickMenu(prev => !prev)}
              className={cn(
                "w-12 h-12 rounded-full bg-[#F6A854] hover:bg-[#e2933f] text-slate-950 flex items-center justify-center shadow-xl border-4 border-white transition-all transform active:scale-90 cursor-pointer",
                showQuickMenu && "rotate-45 bg-slate-900 text-white"
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
              "flex flex-col items-center justify-center transition-all p-1.5 rounded-xl cursor-pointer relative",
              activeView === 'results' || activeView === 'exam_analysis' ? "text-[#163840]" : "text-slate-400 hover:text-slate-700"
            )}
            title="Academic Results"
          >
            <BarChart3 className="w-5 h-5" />
            {(activeView === 'results' || activeView === 'exam_analysis') && (
              <span className="w-1.5 h-1.5 bg-[#F6A854] rounded-full absolute -bottom-0.5" />
            )}
          </button>

          {/* Tab 5: Profile / Settings */}
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={cn(
              "flex flex-col items-center justify-center transition-all p-1.5 rounded-xl cursor-pointer relative",
              activeView === 'settings' ? "text-[#163840]" : "text-slate-400 hover:text-slate-700"
            )}
            title="Profile & Settings"
          >
            <User className="w-5 h-5" />
            {activeView === 'settings' && (
              <span className="w-1.5 h-1.5 bg-[#F6A854] rounded-full absolute -bottom-0.5" />
            )}
          </button>

        </div>
      </div>

      {/* Quick Action Drawer / Menu */}
      <AnimatePresence>
        {showQuickMenu && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-slate-950/50 backdrop-blur-xs pb-20">
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl max-w-sm w-full space-y-3 relative"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Quick Actions
                </span>
                <button
                  type="button"
                  onClick={() => setShowQuickMenu(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
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
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200/60 text-emerald-900 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold leading-tight">Take Attendance</h5>
                    <span className="text-[10px] text-emerald-600">Daily roll</span>
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
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-amber-50 hover:bg-amber-100/70 border border-amber-200/60 text-amber-900 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#F6A854] text-slate-950 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold leading-tight">Set Reminder</h5>
                    <span className="text-[10px] text-amber-700">Add to day</span>
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
                    className="flex items-center gap-2.5 p-3 rounded-2xl bg-teal-50 hover:bg-teal-100/70 border border-teal-200/60 text-teal-900 transition-all text-left"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[#163840] text-white flex items-center justify-center shrink-0">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold leading-tight">Record Fees</h5>
                      <span className="text-[10px] text-teal-600">MoMo / Cash</span>
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
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100/70 border border-indigo-200/60 text-indigo-900 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold leading-tight">Enter Scores</h5>
                    <span className="text-[10px] text-indigo-600">Term assess</span>
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
