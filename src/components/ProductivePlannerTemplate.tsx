import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  Clock, 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Sparkles, 
  Users, 
  Bell, 
  X, 
  LayoutGrid, 
  BarChart3, 
  User, 
  ExternalLink,
  BookOpen,
  Laptop,
  Presentation,
  ListTodo,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useNotifications } from '../contexts/NotificationContext';
import { cn } from '../lib/utils';

export interface ProductivityTask {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  category: 'developer' | 'designer' | 'business' | 'academic' | 'general';
  type?: 'task' | 'meeting' | 'class';
  completed: boolean;
  date?: string;
  attendees?: string[];
  notes?: string;
}

interface ProductivePlannerTemplateProps {
  onNavigateView?: (view: string) => void;
  className?: string;
  initialMode?: 'side-by-side' | 'single-mobile' | 'dashboard' | 'calendar' | 'both';
}

export function ProductivePlannerTemplate({
  onNavigateView,
  className,
  initialMode = 'side-by-side'
}: ProductivePlannerTemplateProps) {
  const { user } = useAuth();
  const { showToast } = useNotifications();

  // Active view across all screen formats (dashboard, calendar, or dual showcase)
  const [activeScreenMode, setActiveScreenMode] = useState<'both' | 'dashboard' | 'calendar'>(() => {
    if (initialMode === 'dashboard') return 'dashboard';
    if (initialMode === 'calendar') return 'calendar';
    if (initialMode === 'both') return 'both';
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      return 'dashboard';
    }
    return 'both';
  });

  // Selected date state (defaults to today)
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(today);

  // Modal states
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderCategory, setReminderCategory] = useState<'developer' | 'designer' | 'business' | 'academic'>('academic');
  const [reminderStartTime, setReminderStartTime] = useState('08:00');
  const [reminderEndTime, setReminderEndTime] = useState('09:30');

  // Local storage persistence for custom tasks
  const [tasks, setTasks] = useState<ProductivityTask[]>(() => {
    const saved = localStorage.getItem('esepa_productive_tasks_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [
      {
        id: 'task-1',
        title: 'Meeting with developer',
        startTime: '07:00',
        endTime: '08:00',
        category: 'developer',
        completed: true,
        attendees: ['Kwame', 'Elena', 'Kofi']
      },
      {
        id: 'task-2',
        title: 'Meeting with designer',
        startTime: '09:00',
        endTime: '10:00',
        category: 'designer',
        completed: true,
        attendees: ['Sarah', 'Ama']
      },
      {
        id: 'task-3',
        title: 'Create a plan for business',
        startTime: '11:00',
        endTime: '12:00',
        category: 'business',
        completed: false,
        attendees: ['Director', 'Bursar', 'Elena']
      },
      {
        id: 'task-4',
        title: 'Zoom meet with client from New York',
        startTime: '08:00',
        endTime: '10:00',
        category: 'business',
        completed: true,
        attendees: ['Client A', 'Client B', 'Elena']
      },
      {
        id: 'task-5',
        title: 'Explore Design App',
        startTime: '11:00',
        endTime: '12:00',
        category: 'designer',
        completed: false,
        attendees: ['Elena']
      },
      {
        id: 'task-6',
        title: 'Academic Board Evaluation',
        startTime: '13:30',
        endTime: '15:00',
        category: 'academic',
        completed: false,
        attendees: ['Headmaster', 'Dean']
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('esepa_productive_tasks_v1', JSON.stringify(tasks));
    } catch (e) {}
  }, [tasks]);

  // Query timetable slots from Dexie DB to blend with real school schedule
  const timetableSetting = useLiveQuery(() => 
    db.settings.where('key').equals('timetable_slots').first()
  );
  
  const timetableSlots = useMemo(() => {
    return Array.isArray(timetableSetting?.value) ? timetableSetting.value : [];
  }, [timetableSetting]);

  // Generate days around selected date for horizontal picker
  const calendarDays = useMemo(() => {
    const days = [];
    const base = new Date(selectedDate);
    // Find current week or centered 5 days
    for (let i = -2; i <= 2; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push(d);
    }
    return days;
  }, [selectedDate]);

  // Calculate completion percentage
  const completionPercentage = useMemo(() => {
    if (tasks.length === 0) return 80;
    const completed = tasks.filter(t => t.completed).length;
    return Math.round((completed / tasks.length) * 100);
  }, [tasks]);

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    showToast('Task updated successfully', 'success');
  };

  const handleCreateReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTitle.trim()) return;

    const newTask: ProductivityTask = {
      id: `task-${Date.now()}`,
      title: reminderTitle.trim(),
      startTime: reminderStartTime,
      endTime: reminderEndTime,
      category: reminderCategory,
      completed: false,
      date: selectedDate.toISOString().split('T')[0],
      attendees: [user?.fullName || 'User']
    };

    setTasks(prev => [newTask, ...prev]);
    setIsReminderModalOpen(false);
    setReminderTitle('');
    showToast('Reminder added to schedule!', 'success');
  };

  // Month navigation
  const prevMonth = () => {
    const d = new Date(currentMonthDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonthDate(d);
  };

  const nextMonth = () => {
    const d = new Date(currentMonthDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonthDate(d);
  };

  const formattedSelectedDay = useMemo(() => {
    const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    const dayNum = selectedDate.getDate();
    const suffix = (dayNum: number) => {
      if (dayNum > 3 && dayNum < 21) return 'th';
      switch (dayNum % 10) {
        case 1:  return 'st';
        case 2:  return 'nd';
        case 3:  return 'rd';
        default: return 'th';
      }
    };
    return `${dayName}, ${dayNum}${suffix(dayNum)}`;
  }, [selectedDate]);

  // Filter tasks for timeline
  const timelineTasks = useMemo(() => {
    return tasks.filter(t => t.startTime);
  }, [tasks]);

  return (
    <div className={cn("w-full transition-all", className)}>
      {/* Responsive View Switcher Controls (Works on mobile, tablet, and desktop) */}
      <div className="flex items-center justify-between mb-5 bg-white/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/90 shadow-2xs max-w-md sm:max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => setActiveScreenMode('dashboard')}
          className={cn(
            "flex-1 py-2 px-2.5 sm:px-3 rounded-xl text-xs font-black transition-all cursor-pointer text-center",
            activeScreenMode === 'dashboard'
              ? "bg-[#1c4a59] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Productivity
        </button>
        <button
          type="button"
          onClick={() => setActiveScreenMode('calendar')}
          className={cn(
            "flex-1 py-2 px-2.5 sm:px-3 rounded-xl text-xs font-black transition-all cursor-pointer text-center",
            activeScreenMode === 'calendar'
              ? "bg-[#1c4a59] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Timeline & Calendar
        </button>
        <button
          type="button"
          onClick={() => setActiveScreenMode('both')}
          className={cn(
            "hidden sm:block flex-1 py-2 px-2.5 sm:px-3 rounded-xl text-xs font-black transition-all cursor-pointer text-center",
            activeScreenMode === 'both'
              ? "bg-[#1c4a59] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Dual Template View
        </button>
      </div>

      {/* Two Screen Showcase / Single Focused Responsive View */}
      <div className={cn(
        activeScreenMode === 'both'
          ? "grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto items-start"
          : "max-w-2xl mx-auto w-full"
      )}>
        
        {/* =========================================================================
            SCREEN 1: "LET'S BECOME MORE PRODUCTIVE" + DASHBOARD SCHEDULE
            ========================================================================= */}
        <div className={cn(
          "bg-[#ffffff] border border-slate-200/90 rounded-3xl sm:rounded-[36px] lg:rounded-[40px] p-4 xs:p-5 sm:p-6 lg:p-7 shadow-xl relative flex flex-col justify-between overflow-hidden w-full",
          activeScreenMode === 'calendar' && "hidden"
        )}>
          {/* Top Bar / Header */}
          <div className="flex items-center justify-between mb-5 sm:mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-tight">
                Let's become <br />
                more <span className="text-[#faae57]">Productive</span>
              </h2>
            </div>
            
            {/* User Profile Avatar with badge */}
            <div className="relative">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#1c4a59] text-white flex items-center justify-center font-bold border-2 border-white shadow-md">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <span className="absolute top-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-[#faae57] border-2 border-white rounded-full"></span>
            </div>
          </div>

          {/* Hero Teal Card */}
          <div className="bg-[#1c4a59] rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-white relative overflow-hidden shadow-lg mb-5 sm:mb-7">
            {/* Decorative background circle */}
            <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full border-8 border-white/5 pointer-events-none" />
            <div className="absolute -right-16 -bottom-16 w-52 h-52 rounded-full border-8 border-white/5 pointer-events-none" />

            <div className="flex items-center justify-between gap-3 sm:gap-4 relative z-10">
              <div className="space-y-2 sm:space-y-3 flex-1 min-w-0 pr-2">
                <h3 className="text-sm xs:text-base sm:text-lg font-bold leading-snug text-white/95">
                  Great, your today's plan almost done
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setActiveScreenMode('calendar');
                    if (onNavigateView) onNavigateView('timetable');
                  }}
                  className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-[#faae57] hover:bg-[#e4ae67] text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>View Task</span>
                </button>
              </div>

              {/* Circular Progress Ring */}
              <div className="relative w-16 h-16 xs:w-20 xs:h-20 sm:w-24 sm:h-24 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background track */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="9"
                    fill="transparent"
                  />
                  {/* Animated Progress Arc */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#faae57"
                    strokeWidth="9"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - completionPercentage / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-sm xs:text-base sm:text-lg font-black text-white">{completionPercentage}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Today's Schedule */}
          <div className="mb-5 sm:mb-6">
            <div className="flex items-center justify-between mb-3.5 sm:mb-4">
              <h4 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                Today's Schedule
              </h4>
              <button
                type="button"
                onClick={() => setActiveScreenMode('calendar')}
                className="text-xs font-bold text-[#faae57] hover:text-[#e4ae67] transition-colors cursor-pointer"
              >
                See all
              </button>
            </div>

            {/* 4 Cards Grid - Responsive across small phones to desktops */}
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 sm:gap-4">
              {/* Card 1: Meeting with developer */}
              <div 
                onClick={() => toggleTask('task-1')}
                className={cn(
                  "bg-white rounded-2xl p-3.5 sm:p-4 border transition-all cursor-pointer flex flex-col justify-between min-h-[130px] shadow-xs group",
                  tasks.find(t => t.id === 'task-1')?.completed ? "border-emerald-200 bg-emerald-50/20" : "border-slate-200/80 hover:border-slate-300"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {tasks.find(t => t.id === 'task-1')?.completed && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                  </div>
                  <h5 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2">
                    Meeting with developer
                  </h5>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 mt-2">
                  <Clock className="w-3 h-3 text-[#faae57]" />
                  <span>07:00 - 08:00</span>
                </div>
              </div>

              {/* Card 2: Meeting with designer (Warm Peach + Illustration) */}
              <div 
                onClick={() => toggleTask('task-2')}
                className="bg-[#f6f8f7] border border-[#e1c594] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[130px] shadow-xs cursor-pointer hover:shadow-md transition-all relative overflow-hidden"
              >
                <div>
                  <h5 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2">
                    Meeting with designer
                  </h5>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 mt-1">
                    <Clock className="w-3 h-3 text-[#faae57]" />
                    <span>09:00 - 10:00</span>
                  </div>
                </div>

                {/* Minimalist vector illustration */}
                <div className="flex justify-end items-end mt-2">
                  <div className="w-14 sm:w-16 h-10 sm:h-12 relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-[#faae57]/20 rounded-xl"></div>
                    <Presentation className="w-5 h-5 sm:w-6 sm:h-6 text-[#1c4a59]" />
                  </div>
                </div>
              </div>

              {/* Card 3: Create a plan for business (Warm Peach + Illustration) */}
              <div 
                onClick={() => toggleTask('task-3')}
                className="bg-[#f6f8f7] border border-[#e1c594] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[130px] shadow-xs cursor-pointer hover:shadow-md transition-all relative overflow-hidden"
              >
                <div>
                  <h5 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2">
                    Create a plan for business
                  </h5>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 mt-1">
                    <Clock className="w-3 h-3 text-[#faae57]" />
                    <span>11:00 - 12:00</span>
                  </div>
                </div>

                {/* Minimalist vector illustration */}
                <div className="flex justify-end items-end mt-2">
                  <div className="w-14 sm:w-16 h-10 sm:h-12 relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-[#1c4a59]/10 rounded-xl"></div>
                    <Laptop className="w-5 h-5 sm:w-6 sm:h-6 text-[#faae57]" />
                  </div>
                </div>
              </div>

              {/* Card 4: Click to view more (Deep Teal) */}
              <div 
                onClick={() => setActiveScreenMode('calendar')}
                className="bg-[#1c4a59] hover:bg-[#163b47] text-white rounded-2xl p-3.5 sm:p-4 flex flex-col justify-center items-center text-center min-h-[130px] shadow-md cursor-pointer transition-all active:scale-95 group"
              >
                <span className="text-xs sm:text-sm font-bold text-white group-hover:underline">
                  Click to <br />view more
                </span>
                <span className="text-[11px] font-medium text-[#faae57] mt-2 block">
                  +{timetableSlots.length > 0 ? timetableSlots.length : 5} schedule
                </span>
              </div>
            </div>
          </div>

          {/* Floating Bottom Nav Mockup (desktop showcase only) */}
          <div className="hidden lg:flex bg-white rounded-3xl p-2.5 px-4 shadow-lg border border-slate-200/80 items-center justify-between mt-auto">
            <button 
              type="button"
              onClick={() => setActiveScreenMode('dashboard')}
              className="p-2 text-[#1c4a59] hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <LayoutGrid className="w-5 h-5 text-[#1c4a59]" />
            </button>
            <button 
              type="button"
              onClick={() => setActiveScreenMode('calendar')}
              className="p-2 text-slate-400 hover:text-[#1c4a59] hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <CalendarIcon className="w-5 h-5" />
            </button>
            {/* Center Floating Plus FAB */}
            <button 
              type="button"
              onClick={() => setIsReminderModalOpen(true)}
              className="w-11 h-11 rounded-full bg-[#faae57] hover:bg-[#e4ae67] text-slate-950 flex items-center justify-center shadow-lg -mt-5 border-2 border-white transition-transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
            <button 
              type="button"
              onClick={() => onNavigateView && onNavigateView('results')}
              className="p-2 text-slate-400 hover:text-[#1c4a59] hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <BarChart3 className="w-5 h-5" />
            </button>
            <button 
              type="button"
              onClick={() => onNavigateView && onNavigateView('users')}
              className="p-2 text-slate-400 hover:text-[#1c4a59] hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>


        {/* =========================================================================
            SCREEN 2: CALENDAR TIMELINE & "SET REMINDER" VIEW
            ========================================================================= */}
        <div className={cn(
          "bg-[#ffffff] border border-slate-200/90 rounded-3xl sm:rounded-[36px] lg:rounded-[40px] p-4 xs:p-5 sm:p-6 lg:p-7 shadow-xl relative flex flex-col justify-between overflow-hidden w-full",
          activeScreenMode === 'dashboard' && "hidden"
        )}>
          {/* Top Deep Teal Calendar Header */}
          <div className="bg-[#1c4a59] rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden mb-6">
            {/* Concentric circle graphics */}
            <div className="absolute -right-6 -bottom-6 w-36 h-36 rounded-full border-8 border-white/5 pointer-events-none" />
            <div className="absolute -right-14 -bottom-14 w-52 h-52 rounded-full border-8 border-white/5 pointer-events-none" />

            {/* Month Header Navigation */}
            <div className="flex items-center justify-between mb-5 relative z-10">
              <button 
                type="button" 
                onClick={prevMonth}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <h3 className="text-base font-black tracking-wide text-white">
                {currentMonthDate.toLocaleDateString('en-US', { month: 'long' })}
              </h3>

              <button 
                type="button" 
                onClick={nextMonth}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Horizontal Days Selector */}
            <div className="flex items-center justify-between gap-1 mb-5 relative z-10">
              {calendarDays.map((dateObj, idx) => {
                const isSelected = dateObj.toDateString() === selectedDate.toDateString();
                const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNumber = dateObj.getDate();

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDate(dateObj)}
                    className="flex flex-col items-center gap-1 sm:gap-1.5 focus:outline-none transition-all cursor-pointer"
                  >
                    <span className="text-[10px] xs:text-[11px] font-semibold text-white/70">{dayLabel}</span>
                    <div className={cn(
                      "w-8 h-8 xs:w-9 xs:h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-black transition-all",
                      isSelected 
                        ? "bg-[#faae57] text-slate-950 shadow-md scale-105" 
                        : "text-white/90 hover:bg-white/10"
                    )}>
                      {dayNumber}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* "Set Reminder" Action Button */}
            <div className="relative z-10 pt-1">
              <button
                type="button"
                onClick={() => setIsReminderModalOpen(true)}
                className="w-full py-2.5 sm:py-3 rounded-full bg-[#faae57] hover:bg-[#e4ae67] text-slate-950 font-black text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer text-center"
              >
                Set Reminder
              </button>
            </div>
          </div>

          {/* Subtitle: Selected Day */}
          <div className="mb-4">
            <h4 className="text-base font-extrabold text-slate-900">
              {formattedSelectedDay}
            </h4>
          </div>

          {/* Vertical Timeline View */}
          <div className="relative space-y-4 mb-6 pr-1">
            {/* Timeline Vertical Guide Line */}
            <div className="absolute left-[45px] top-2 bottom-2 w-0.5 bg-slate-200 pointer-events-none" />

            {/* Time Slot 08:00 - 10:00 (Warm Peach Card with Avatars) */}
            <div className="flex items-start gap-3 sm:gap-4 relative">
              <div className="w-10 text-right shrink-0">
                <span className="text-xs font-bold text-slate-400">08:00</span>
                <span className="text-xs font-bold text-slate-400 block mt-8">09:00</span>
              </div>
              <div className="relative flex-1 min-w-0">
                <div className="bg-[#f6f8f7] border border-[#e1c594] rounded-2xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden">
                  <h5 className="text-xs sm:text-sm font-bold text-slate-800">
                    Zoom meet with client from New York
                  </h5>
                  <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
                    08:00 - 10:00
                  </span>

                  {/* Overlapping Attendees Avatars */}
                  <div className="flex items-center -space-x-2 mt-3">
                    <div className="w-6 h-6 rounded-full bg-[#1c4a59] text-white text-[9px] font-black flex items-center justify-center border-2 border-white">
                      AK
                    </div>
                    <div className="w-6 h-6 rounded-full bg-[#faae57] text-slate-950 text-[9px] font-black flex items-center justify-center border-2 border-white">
                      EL
                    </div>
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[9px] font-black flex items-center justify-center border-2 border-white">
                      KB
                    </div>
                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[8px] font-bold flex items-center justify-center border-2 border-white">
                      +2
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Time Indicator Line at ~10:15 */}
            <div className="flex items-center gap-3 sm:gap-4 relative py-1">
              <div className="w-10 text-right shrink-0">
                <span className="text-xs font-bold text-slate-400">10:00</span>
              </div>
              <div className="relative flex-1 flex items-center">
                {/* Orange Dot on timeline axis */}
                <div className="w-2.5 h-2.5 rounded-full bg-[#faae57] -ml-[19px] shrink-0 border-2 border-white shadow-xs z-10" />
                <div className="h-0.5 bg-[#faae57] flex-1 rounded-full" />
              </div>
            </div>

            {/* Time Slot 11:00 - 12:00 (White Card: Explore Design App) */}
            <div className="flex items-start gap-3 sm:gap-4 relative">
              <div className="w-10 text-right shrink-0">
                <span className="text-xs font-bold text-slate-400">11:00</span>
                <span className="text-xs font-bold text-slate-400 block mt-6">12:00</span>
              </div>
              <div className="relative flex-1 min-w-0">
                <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-xs">
                  <h5 className="text-xs sm:text-sm font-bold text-slate-800">
                    Explore Design App
                  </h5>
                  <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
                    11:00 - 12:00
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Bottom Nav Mockup (desktop showcase only) */}
          <div className="hidden lg:flex bg-white rounded-3xl p-2.5 px-4 shadow-lg border border-slate-200/80 items-center justify-between mt-auto">
            <button 
              type="button"
              onClick={() => setActiveScreenMode('dashboard')}
              className="p-2 text-slate-400 hover:text-[#1c4a59] hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button 
              type="button"
              onClick={() => setActiveScreenMode('calendar')}
              className="p-2 text-[#1c4a59] hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <CalendarIcon className="w-5 h-5 text-[#1c4a59]" />
            </button>
            {/* Center Floating Plus FAB */}
            <button 
              type="button"
              onClick={() => setIsReminderModalOpen(true)}
              className="w-11 h-11 rounded-full bg-[#faae57] hover:bg-[#e4ae67] text-slate-950 flex items-center justify-center shadow-lg -mt-5 border-2 border-white transition-transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
            <button 
              type="button"
              onClick={() => onNavigateView && onNavigateView('results')}
              className="p-2 text-slate-400 hover:text-[#1c4a59] hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <BarChart3 className="w-5 h-5" />
            </button>
            <button 
              type="button"
              onClick={() => onNavigateView && onNavigateView('users')}
              className="p-2 text-slate-400 hover:text-[#1c4a59] hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>

      </div>

      {/* =========================================================================
          "SET REMINDER" MODAL DIALOG
          ========================================================================= */}
      <AnimatePresence>
        {isReminderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 xs:p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-4 xs:p-6 shadow-2xl relative text-left max-h-[92vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#1c4a59] text-[#faae57] flex items-center justify-center font-bold">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Set Schedule Reminder</h3>
                    <p className="text-xs text-slate-500">{formattedSelectedDay}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReminderModalOpen(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateReminder} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Event / Task Title
                  </label>
                  <input
                    type="text"
                    required
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    placeholder="e.g. Meeting with developer / Math Class"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={reminderStartTime}
                      onChange={(e) => setReminderStartTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={reminderEndTime}
                      onChange={(e) => setReminderEndTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Category
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'developer', label: 'Developer', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                      { id: 'designer', label: 'Designer', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                      { id: 'business', label: 'Business', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                      { id: 'academic', label: 'Academic', color: 'bg-purple-50 text-purple-700 border-purple-200' }
                    ].map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setReminderCategory(cat.id as any)}
                        className={cn(
                          "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                          reminderCategory === cat.id ? "bg-[#1c4a59] text-white border-[#1c4a59]" : cat.color
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 rounded-full bg-[#faae57] hover:bg-[#e4ae67] text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    Save to Schedule
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
