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
  Wallet,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

interface NavItemEntry {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MobileBottomNavProps {
  activeView: string;
  onNavigate: (view: any) => void;
  onOpenQuickReminder?: () => void;
  navItems?: NavItemEntry[];
  mobileMenuOpen?: boolean;
  onOpenMobileMenu?: () => void;
  actionSlot?: React.ReactNode;
}

export interface MobileSafeActionStackProps {
  /** Primary action button or bar (e.g. Submit, Save All, Checkout) stacked directly above the bottom nav */
  actionSlot?: React.ReactNode;
  /** Custom bottom navigation bar */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Reusable mobile bottom dock wrapper that automatically accounts for iPhone Home Indicator /
 * Dynamic Island and Android gesture bars via env(safe-area-inset-bottom), while stacking
 * primary action buttons cleanly above the custom bottom navigation bar without overlap.
 */
export function MobileSafeActionStack({
  actionSlot,
  children,
  className,
}: MobileSafeActionStackProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 lg:hidden print:hidden pointer-events-none flex flex-col items-center justify-end gap-2.5 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] mobile-safe-dock",
        className
      )}
    >
      {actionSlot && (
        <div className="w-full max-w-md mx-auto pointer-events-auto">
          {actionSlot}
        </div>
      )}
      {children}
    </div>
  );
}

export function MobileBottomNav({
  activeView,
  onNavigate,
  onOpenQuickReminder,
  navItems,
  mobileMenuOpen,
  onOpenMobileMenu,
  actionSlot,
}: MobileBottomNavProps) {
  const { user } = useAuth();
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  const primaryTabs = navItems && navItems.length >= 2 ? navItems.slice(0, 2) : null;
  const thirdTab = navItems && navItems.length >= 3 ? navItems[2] : null;

  return (
    <>
      {/* Floating Bottom Bar Container - visible on mobile and tablet (hidden on desktop or print) */}
      <MobileSafeActionStack actionSlot={actionSlot}>
        <nav
          aria-label="Mobile Bottom Navigation"
          className="bg-white/95 backdrop-blur-md rounded-full shadow-[0_8px_28px_rgba(28,74,89,0.18)] border border-[#bac4c6]/90 py-2 px-3 sm:px-5 flex items-center justify-around gap-1 sm:gap-4 pointer-events-auto max-w-md w-full min-h-[60px] relative"
        >
          {primaryTabs ? (
            primaryTabs.map((item) => {
              const isActive = activeView === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    "flex flex-col items-center justify-center min-w-[52px] min-h-[44px] rounded-full transition-all cursor-pointer px-2 relative",
                    isActive ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "text-[#1c4a59] stroke-[2.5]")} />
                  <span
                    className={cn(
                      "text-[9px] mt-0.5 tracking-tight truncate max-w-[56px]",
                      isActive ? "font-extrabold text-[#1c4a59]" : "font-semibold text-[#6a7f84]"
                    )}
                  >
                    {item.label.split(' ')[0]}
                  </span>
                </button>
              );
            })
          ) : (
            <>
              {/* Fallback Tab 1: Dashboard */}
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
                <span className="text-[9px] mt-0.5 font-semibold tracking-tight">Home</span>
              </button>

              {/* Fallback Tab 2: Timetable / Schedule */}
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
                <span className="text-[9px] mt-0.5 font-semibold tracking-tight">Schedule</span>
              </button>
            </>
          )}

          {/* Center Raised Warm Amber FAB Button (+) */}
          <div className="relative -mt-5 shrink-0">
            <button
              type="button"
              onClick={() => setShowQuickMenu(prev => !prev)}
              className={cn(
                "w-12 h-12 rounded-full bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] flex items-center justify-center shadow-[0_6px_18px_rgba(250,174,87,0.45)] border-2 border-white transition-all transform active:scale-95 cursor-pointer min-h-[48px] min-w-[48px]",
                showQuickMenu && "rotate-45 bg-[#1c4a59] text-white"
              )}
              title="Quick Actions"
            >
              <Plus className="w-5 h-5 stroke-[2.75]" />
            </button>
          </div>

          {/* Tab 4: 3rd Dynamic Nav Item or Results */}
          {thirdTab ? (
            (() => {
              const isActive = activeView === thirdTab.id;
              const Icon = thirdTab.icon;
              return (
                <button
                  key={thirdTab.id}
                  type="button"
                  onClick={() => onNavigate(thirdTab.id)}
                  className={cn(
                    "flex flex-col items-center justify-center min-w-[52px] min-h-[44px] rounded-full transition-all cursor-pointer px-2 relative",
                    isActive ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "text-[#1c4a59] stroke-[2.5]")} />
                  <span
                    className={cn(
                      "text-[9px] mt-0.5 tracking-tight truncate max-w-[56px]",
                      isActive ? "font-extrabold text-[#1c4a59]" : "font-semibold text-[#6a7f84]"
                    )}
                  >
                    {thirdTab.label.split(' ')[0]}
                  </span>
                </button>
              );
            })()
          ) : (
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
              <span className="text-[9px] mt-0.5 font-semibold tracking-tight">Results</span>
            </button>
          )}

          {/* Tab 5: More Drawer Trigger or Profile/Settings */}
          {onOpenMobileMenu ? (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className={cn(
                "flex flex-col items-center justify-center min-w-[52px] min-h-[44px] rounded-full transition-all cursor-pointer px-2 relative",
                mobileMenuOpen ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
              )}
              title="More Modules"
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="text-[9px] mt-0.5 font-semibold tracking-tight">More</span>
            </button>
          ) : (
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
              <span className="text-[9px] mt-0.5 font-semibold tracking-tight">Settings</span>
            </button>
          )}
        </nav>
      </MobileSafeActionStack>

      {/* Quick Action Drawer / Menu */}
      <AnimatePresence>
        {showQuickMenu && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-slate-900/40 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
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
                {/* Assessments & SBA */}
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onNavigate('assessments');
                  }}
                  className="col-span-2 flex items-center justify-between p-3 rounded-2xl bg-[#faae57]/20 hover:bg-[#faae57]/30 border border-[#faae57]/50 text-[#1f2a2e] transition-all text-left min-h-[46px] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#1c4a59] text-[#faae57] flex items-center justify-center shrink-0 font-bold shadow-xs">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h5 className="text-xs font-bold leading-tight text-[#1c4a59]">Assessments & SBA Hub</h5>
                        <span className="text-[8px] bg-[#faae57] text-[#1c4a59] font-black px-1.5 py-0.2 rounded-full uppercase">NEW</span>
                      </div>
                      <span className="text-[10px] text-[#6a7f84]">Homework, Classwork, Tests & Exams</span>
                    </div>
                  </div>
                </button>

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
