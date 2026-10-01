import React, { useState, useEffect, useMemo } from 'react';
import {
  LifeBuoy,
  X,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  SupportTicket,
  fetchSupportTickets,
  createSupportTicket,
  updateSupportTicket
} from '../lib/supportTicketsApi';

interface ClientSupportWidgetProps {
  user: {
    id?: string | number;
    username?: string;
    fullName?: string;
    role?: string;
    school_id?: string | null;
  } | null;
  schoolId?: string | null;
  schoolName: string;
  onNotify?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const PORTAL_MODULES = [
  'General / Portal',
  'Students',
  'Academic',
  'School Timetable',
  'Lesson Notes',
  'Attendance',
  'Results Terminal',
  'Exam Analysis',
  'Reports',
  'Fees & Payments',
  'Siren Console',
  'E-Voting Portal',
  'Inventory Registry',
  'Licensing & Billing',
  'User Management & Settings'
];

const SCHOOL_WIDE_VIEW_ROLES = ['admin', 'headteacher'];
const DOCK_STORAGE_KEY = 'schoolsphere_support_docked';

function getStatusMetadata(status: SupportTicket['status']) {
  if (status === 'resolved') {
    return {
      label: 'Resolved',
      step: 3,
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300',
      dotClass: 'bg-emerald-500',
      Icon: CheckCircle2
    };
  }
  if (status === 'in_progress') {
    return {
      label: 'In Progress',
      step: 2,
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-300',
      dotClass: 'bg-blue-500',
      Icon: Activity
    };
  }
  return {
    label: 'Pending',
    step: 1,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    dotClass: 'bg-amber-500',
    Icon: Clock
  };
}

function TicketProgressTracker({
  status,
  compact = false
}: {
  status: SupportTicket['status'];
  compact?: boolean;
}) {
  const { step } = getStatusMetadata(status);
  const stages = [
    { index: 1, label: 'Pending' },
    { index: 2, label: 'In Progress' },
    { index: 3, label: 'Resolved' }
  ];

  return (
    <div
      className={cn('w-full', compact ? 'pt-1.5' : 'pt-2')}
      aria-label={`Issue progression: step ${step} of 3 (${stages[step - 1].label})`}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {stages.map((stage) => {
          const isCompleted = step > stage.index || (step === 3 && stage.index === 3);
          const isCurrent = step === stage.index;

          const barColor =
            stage.index === 1
              ? isCurrent || isCompleted
                ? 'bg-amber-500'
                : 'bg-slate-200'
              : stage.index === 2
              ? isCurrent
                ? 'bg-blue-600'
                : isCompleted
                ? 'bg-emerald-500'
                : 'bg-slate-200'
              : isCompleted
              ? 'bg-emerald-600'
              : 'bg-slate-200';

          const textColor =
            stage.index === 1 && isCurrent
              ? 'text-amber-800 font-semibold'
              : stage.index === 2 && isCurrent
              ? 'text-blue-700 font-semibold'
              : stage.index === 3 && isCurrent
              ? 'text-emerald-700 font-semibold'
              : isCompleted
              ? 'text-slate-700 font-medium'
              : 'text-slate-400';

          return (
            <div key={stage.index} className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-200',
                    barColor,
                    isCurrent || isCompleted ? 'w-full' : 'w-0'
                  )}
                />
              </div>
              <div className="flex items-center gap-1 text-[10px] leading-none">
                <span className={cn('font-mono tabular-nums', textColor)}>
                  {isCompleted ? '✓' : `${stage.index}.`}
                </span>
                <span className={cn('truncate', textColor)}>{stage.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ClientSupportWidget({
  user,
  schoolId,
  schoolName,
  onNotify
}: ClientSupportWidgetProps) {
  const userRole = String(user?.role || 'client').toLowerCase();
  // Accessible to all authenticated client roles (admin, headteacher, hod, teacher, accountant, student, parent)
  const canAccessSupport = Boolean(
    user && userRole !== 'creator' && userRole !== 'super_admin'
  );
  const canViewAllSchoolTickets = Boolean(user && SCHOOL_WIDE_VIEW_ROLES.includes(userRole));
  const currentUserId = String(user?.id || user?.username || '');
  const currentUserName = user?.fullName || user?.username || 'Portal User';

  const [isOpen, setIsOpen] = useState(false);
  // Default to slim right-edge docked state so it never interrupts app usage
  const [isRetracted, setIsRetracted] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return true;
    try {
      const saved = localStorage.getItem(DOCK_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scopeTab, setScopeTab] = useState<'school' | 'own'>(
    canViewAllSchoolTickets ? 'school' : 'own'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // New Ticket Form State
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('General / Portal');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reply State
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  useEffect(() => {
    setScopeTab(canViewAllSchoolTickets ? 'school' : 'own');
  }, [canViewAllSchoolTickets]);

  const toggleRetracted = (nextState: boolean) => {
    setIsRetracted(nextState);
    if (nextState) {
      setIsHoverExpanded(false);
    }
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DOCK_STORAGE_KEY, nextState ? 'true' : 'false');
      } catch {}
    }
  };

  const loadTickets = async (silent = false) => {
    if (!canAccessSupport) return;
    if (!silent) setIsLoading(true);
    try {
      const list = await fetchSupportTickets({
        schoolId: schoolId || user?.school_id || null,
        schoolName,
        userId: currentUserId,
        role: userRole,
        scope: canViewAllSchoolTickets ? 'school' : 'own'
      });
      setTickets(list);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccessSupport) return;
    loadTickets(true);
    const interval = setInterval(() => loadTickets(true), 20000);
    const handleSync = () => loadTickets(true);
    window.addEventListener('schoolsphere_support_tickets_updated', handleSync);
    return () => {
      clearInterval(interval);
      window.removeEventListener('schoolsphere_support_tickets_updated', handleSync);
    };
  }, [canAccessSupport, schoolId, schoolName, currentUserId, userRole]);

  useEffect(() => {
    if (isOpen) {
      loadTickets(false);
    }
  }, [isOpen]);

  const scopedTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (!canViewAllSchoolTickets || scopeTab === 'own') {
        const isMine =
          String(t.submittedById || '').toLowerCase() === currentUserId.toLowerCase() ||
          String(t.submittedByName || '').toLowerCase() === currentUserName.toLowerCase();
        if (!isMine) return false;
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [tickets, canViewAllSchoolTickets, scopeTab, statusFilter, currentUserId, currentUserName]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  // Count active unresolved tickets or Creator replies for badge
  const activeAttentionCount = useMemo(() => {
    return tickets.filter((t) => {
      if (!canViewAllSchoolTickets) {
        const isMine =
          String(t.submittedById || '').toLowerCase() === currentUserId.toLowerCase() ||
          String(t.submittedByName || '').toLowerCase() === currentUserName.toLowerCase();
        if (!isMine) return false;
      }
      if (t.status === 'resolved') return false;
      const lastMsg = t.messages?.[t.messages.length - 1];
      return Boolean(lastMsg?.isCreator || t.status === 'in_progress' || t.status === 'open');
    }).length;
  }, [tickets, canViewAllSchoolTickets, currentUserId, currentUserName]);

  if (!canAccessSupport) {
    return null;
  }

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSubject = subject.trim();
    const cleanDesc = description.trim();
    if (!cleanSubject || !cleanDesc) {
      setFormError('Please provide both an issue subject and a detailed description.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    const result = await createSupportTicket({
      schoolId: schoolId || user?.school_id || null,
      schoolName,
      submittedById: currentUserId,
      submittedByName: currentUserName,
      submittedByRole: userRole,
      subject: cleanSubject,
      category,
      priority,
      description: cleanDesc
    });
    setIsSubmitting(false);

    if (result.success && result.ticket) {
      setTickets((prev) => [result.ticket!, ...prev.filter((item) => item.id !== result.ticket!.id)]);
      setSubject('');
      setDescription('');
      setPriority('medium');
      setCategory('General / Portal');
      setIsCreatingNew(false);
      setSelectedTicketId(result.ticket.id);
      if (onNotify) {
        onNotify(`Support ticket ${result.ticket.ticketNumber} submitted to SchoolSphere Support.`, 'success');
      }
    } else {
      setFormError(result.error || 'Unable to submit ticket right now.');
    }
  };

  const handleSendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setIsSendingReply(true);
    const result = await updateSupportTicket(selectedTicket.id, {
      messageText: replyText.trim(),
      senderName: currentUserName,
      senderRole: userRole,
      isCreator: false,
      schoolId: schoolId || user?.school_id || null
    });
    setIsSendingReply(false);
    if (result.success && result.ticket) {
      setTickets((prev) => prev.map((t) => (t.id === result.ticket!.id ? result.ticket! : t)));
      setReplyText('');
    }
  };

  const handleToggleStatus = async (ticket: SupportTicket, nextStatus: 'open' | 'resolved') => {
    const result = await updateSupportTicket(ticket.id, {
      status: nextStatus,
      schoolId: schoolId || user?.school_id || null
    });
    if (result.success && result.ticket) {
      setTickets((prev) => prev.map((t) => (t.id === result.ticket!.id ? result.ticket! : t)));
      if (onNotify) {
        onNotify(
          `Ticket ${ticket.ticketNumber} marked as ${nextStatus === 'resolved' ? 'Resolved' : 'Pending'}.`,
          'info'
        );
      }
    }
  };

  const isDrawerExpanded = !isRetracted || isHoverExpanded;

  return (
    <>
      {/* Non-Intrusive Mid-Right Edge Support Desk Tab (Away from bottom buttons, pagination, and nav) */}
      <div
        onMouseEnter={() => setIsHoverExpanded(true)}
        onMouseLeave={() => setIsHoverExpanded(false)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 print:hidden pointer-events-none"
      >
        <div
          className={cn(
            'pointer-events-auto flex items-center bg-[#1c4a59]/95 hover:bg-[#1c4a59] text-white rounded-l-xl shadow-md border border-r-0 border-[#faae57]/45 transition-all duration-150 overflow-hidden',
            isDrawerExpanded ? 'opacity-100' : 'opacity-80 hover:opacity-100'
          )}
        >
          {isDrawerExpanded ? (
            /* Hover / Expanded Slide-Out Drawer Pill */
            <div className="flex items-center">
              <button
                type="button"
                id="client-support-launcher"
                onClick={() => {
                  setIsOpen(true);
                  setIsHoverExpanded(false);
                }}
                className="group flex items-center gap-2 pl-3 pr-2.5 py-2 hover:bg-white/10 transition-colors cursor-pointer"
                title="Open Support Desk & Track Reported Issues"
              >
                <LifeBuoy className="w-4 h-4 text-[#faae57] shrink-0 transition-transform duration-200 group-hover:rotate-12" />
                <div className="text-left">
                  <span className="text-xs font-semibold tracking-tight whitespace-nowrap block leading-tight">
                    Support Desk
                  </span>
                  <span className="text-[10px] text-white/70 whitespace-nowrap block leading-tight">
                    Report or track issue
                  </span>
                </div>
                {activeAttentionCount > 0 && (
                  <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#faae57] text-slate-950 leading-none ml-0.5">
                    {activeAttentionCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => toggleRetracted(true)}
                className="px-1.5 py-3 border-l border-white/15 hover:bg-white/10 text-white/75 hover:text-[#faae57] transition-colors cursor-pointer flex items-center justify-center"
                title="Tuck Support Tab to Screen Edge"
                aria-label="Tuck Support Tab to Screen Edge"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* Default Resting State: Slim 28px Vertical Edge Tab */
            <button
              type="button"
              id="client-support-launcher-docked"
              onClick={() => setIsOpen(true)}
              className="w-7 py-3 px-1 flex flex-col items-center justify-center gap-1.5 hover:bg-white/10 transition-colors cursor-pointer select-none"
              title="Support Desk — Hover or click to report an issue"
              aria-label="Open Support Desk"
            >
              <ChevronLeft className="w-3 h-3 text-[#faae57]/90 shrink-0" />
              <LifeBuoy className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/90 [writing-mode:vertical-rl] rotate-180 leading-none py-0.5">
                Support
              </span>
              {activeAttentionCount > 0 && (
                <span className="font-mono tabular-nums text-[9px] font-bold w-4 h-4 rounded-full bg-[#faae57] text-slate-950 flex items-center justify-center leading-none">
                  {activeAttentionCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Support Ticketing Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.16 }}
              className="bg-white border border-[#bac4c6] rounded-2xl shadow-2xl w-full max-w-4xl h-[86vh] max-h-[740px] flex flex-col overflow-hidden text-[#1f2a2e]"
            >
              {/* Modal Header */}
              <div className="bg-[#1c4a59] text-white px-5 py-4 flex items-center justify-between gap-4 border-b border-white/10 shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[#faae57] font-medium">
                    <span>SchoolSphere Help Desk</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{schoolName}</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight mt-0.5 truncate">
                    Client Issue &amp; Support Ticketing
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNew(true);
                      setSelectedTicketId(null);
                      setFormError(null);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-[#faae57] hover:bg-[#f3a03f] text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Report Issue</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => loadTickets(false)}
                    disabled={isLoading}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer disabled:opacity-50"
                    title="Sync Tickets with Supabase"
                  >
                    <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    aria-label="Close Support Desk"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Sub-header Bar: Role Scope Tabs & Status Filters */}
              <div className="px-5 py-2.5 bg-[#f6f8f7] border-b border-[#bac4c6] flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-1 p-1 bg-white border border-[#bac4c6]/80 rounded-lg">
                  {canViewAllSchoolTickets && (
                    <button
                      type="button"
                      onClick={() => setScopeTab('school')}
                      className={cn(
                        'px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap',
                        scopeTab === 'school'
                          ? 'bg-[#1c4a59] text-white'
                          : 'text-[#6a7f84] hover:text-[#1f2a2e]'
                      )}
                    >
                      All School Tickets ({tickets.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setScopeTab('own')}
                    className={cn(
                      'px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap',
                      scopeTab === 'own' || !canViewAllSchoolTickets
                        ? 'bg-[#1c4a59] text-white'
                        : 'text-[#6a7f84] hover:text-[#1f2a2e]'
                    )}
                  >
                    My Submitted Tickets
                  </button>
                </div>

                <div className="flex items-center gap-1 p-1 bg-white border border-[#bac4c6]/80 rounded-lg">
                  {(['all', 'open', 'in_progress', 'resolved'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={cn(
                        'px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                        statusFilter === st
                          ? 'bg-slate-900 text-white'
                          : 'text-[#6a7f84] hover:text-[#1f2a2e]'
                      )}
                    >
                      {st === 'all'
                        ? 'All'
                        : st === 'in_progress'
                        ? 'In Progress'
                        : st === 'resolved'
                        ? 'Resolved'
                        : 'Pending'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Split Body */}
              <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Left Column: Ticket Queue List with Color Status Badges & 3-Step Progression */}
                <div
                  className={cn(
                    'w-full md:w-84 lg:w-96 border-r border-[#bac4c6] flex flex-col bg-white shrink-0',
                    (selectedTicket || isCreatingNew) && 'hidden md:flex'
                  )}
                >
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {isLoading && tickets.length === 0 ? (
                      <div className="p-6 space-y-3">
                        {[1, 2, 3].map((n) => (
                          <div key={n} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
                        ))}
                      </div>
                    ) : scopedTickets.length === 0 ? (
                      <div className="p-8 text-center space-y-3">
                        <MessageSquare className="w-8 h-8 text-[#6a7f84] mx-auto stroke-[1.5]" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-[#1f2a2e]">No support tickets found</p>
                          <p className="text-xs text-[#6a7f84] leading-relaxed">
                            Encountered a system issue or need assistance from the SchoolSphere Team? Submit a ticket to track its live resolution progress.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingNew(true);
                            setSelectedTicketId(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1c4a59] hover:bg-[#153945] text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#faae57]" />
                          <span>Submit First Issue</span>
                        </button>
                      </div>
                    ) : (
                      scopedTickets.map((ticket) => {
                        const isSelected = !isCreatingNew && selectedTicketId === ticket.id;
                        const lastMsg = ticket.messages?.[ticket.messages.length - 1];
                        const statusMeta = getStatusMetadata(ticket.status);
                        const StatusIcon = statusMeta.Icon;

                        return (
                          <button
                            key={ticket.id}
                            type="button"
                            onClick={() => {
                              setIsCreatingNew(false);
                              setSelectedTicketId(ticket.id);
                            }}
                            className={cn(
                              'w-full text-left p-4 transition-colors cursor-pointer flex flex-col gap-2',
                              isSelected ? 'bg-[#f6f8f7]' : 'hover:bg-slate-50'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-xs text-[#6a7f84] min-w-0 truncate">
                                <span className="font-mono tabular-nums font-semibold text-[#1c4a59]">
                                  {ticket.ticketNumber}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{ticket.category}</span>
                              </div>

                              {/* Color-Coded Status Badge */}
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-semibold shrink-0 whitespace-nowrap',
                                  statusMeta.badgeClass
                                )}
                              >
                                <StatusIcon className="w-3 h-3 shrink-0" />
                                <span>{statusMeta.label}</span>
                              </span>
                            </div>

                            <p className="text-sm font-semibold text-[#1f2a2e] line-clamp-1">
                              {ticket.subject}
                            </p>

                            <div className="flex items-center justify-between gap-2 text-xs text-[#6a7f84]">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate">{ticket.submittedByName}</span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={cn(
                                    'font-medium capitalize',
                                    (ticket.priority === 'high' || ticket.priority === 'critical') &&
                                      'text-[#DC2626] font-semibold'
                                  )}
                                >
                                  {ticket.priority} priority
                                </span>
                              </div>
                              <span className="font-mono tabular-nums shrink-0">
                                {new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short'
                                })}
                              </span>
                            </div>

                            {/* 3-Step Visual Issue Progression Tracker */}
                            <TicketProgressTracker status={ticket.status} compact />

                            {lastMsg?.isCreator && ticket.status !== 'resolved' && (
                              <p className="text-xs font-medium text-[#1c4a59] truncate pt-0.5">
                                Support replied: &ldquo;{lastMsg.text}&rdquo;
                              </p>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Direct Vendor Contact Footer */}
                  <div className="p-3.5 bg-[#f6f8f7] border-t border-[#bac4c6] text-xs text-[#6a7f84] space-y-0.5 shrink-0">
                    <p className="font-semibold text-[#1f2a2e]">SchoolSphere Team / Emmanuel Amoako</p>
                    <p className="font-mono tabular-nums text-[11px]">
                      amoakoemmanuel@hotmail.com · 0551187045 / 0554234590
                    </p>
                  </div>
                </div>

                {/* Right Column: Ticket Form or Thread Detail */}
                <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
                  {isCreatingNew ? (
                    <form
                      onSubmit={handleCreateTicket}
                      className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <div>
                          <h3 className="text-base font-bold text-[#1f2a2e]">
                            Submit a New System Issue
                          </h3>
                          <p className="text-xs text-[#6a7f84]">
                            Dispatches directly to the SchoolSphere Creator Customer Support desk.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCreatingNew(false)}
                          className="md:hidden inline-flex items-center gap-1 text-xs font-semibold text-[#1c4a59]"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Back
                        </button>
                      </div>

                      {formError && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[#1f2a2e] block">
                          Issue Subject
                        </label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="e.g., Unable to view Term 1 continuous assessment results"
                          className="w-full px-3.5 py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg text-sm text-[#1f2a2e] focus:outline-hidden focus:border-[#1c4a59]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-[#1f2a2e] block">
                            Affected Module
                          </label>
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg text-xs font-semibold text-[#1f2a2e] focus:outline-hidden focus:border-[#1c4a59]"
                          >
                            {PORTAL_MODULES.map((mod) => (
                              <option key={mod} value={mod}>
                                {mod}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-[#1f2a2e] block">
                            Urgency / Priority
                          </label>
                          <select
                            value={priority}
                            onChange={(e) =>
                              setPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')
                            }
                            className="w-full px-3.5 py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg text-xs font-semibold text-[#1f2a2e] focus:outline-hidden focus:border-[#1c4a59]"
                          >
                            <option value="low">Low — General question or minor UI feedback</option>
                            <option value="medium">Medium — Standard module issue</option>
                            <option value="high">High — Key workflow impacted</option>
                            <option value="critical">Critical — Urgent portal or grading blocker</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[#1f2a2e] block">
                          Detailed Issue Description
                        </label>
                        <textarea
                          rows={5}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Describe what happened, which screen or record was involved, and any error message shown..."
                          className="w-full px-3.5 py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg text-sm text-[#1f2a2e] focus:outline-hidden focus:border-[#1c4a59] resize-none"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsCreatingNew(false)}
                          className="px-4 py-2 rounded-lg border border-[#bac4c6] text-xs font-semibold text-[#6a7f84] hover:text-[#1f2a2e] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="px-5 py-2 rounded-lg bg-[#1c4a59] hover:bg-[#153945] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5 text-[#faae57]" />
                          <span>{isSubmitting ? 'Submitting Ticket...' : 'Submit Support Ticket'}</span>
                        </button>
                      </div>
                    </form>
                  ) : selectedTicket ? (
                    <div className="flex-1 flex flex-col min-h-0">
                      {/* Thread Header with Color Status Badge & 3-Step Progression */}
                      {(() => {
                        const detailMeta = getStatusMetadata(selectedTicket.status);
                        const DetailStatusIcon = detailMeta.Icon;
                        return (
                          <div className="p-4 sm:p-5 border-b border-slate-200 space-y-3 shrink-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 text-xs text-[#6a7f84] flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTicketId(null)}
                                    className="md:hidden inline-flex items-center gap-1 font-semibold text-[#1c4a59] mr-1"
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                  </button>
                                  <span className="font-mono tabular-nums font-bold text-[#1c4a59]">
                                    {selectedTicket.ticketNumber}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{selectedTicket.category}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="capitalize">{selectedTicket.priority} priority</span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    Reported by {selectedTicket.submittedByName} ({selectedTicket.submittedByRole})
                                  </span>
                                </div>
                                <h3 className="text-base font-bold text-[#1f2a2e]">
                                  {selectedTicket.subject}
                                </h3>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold whitespace-nowrap',
                                    detailMeta.badgeClass
                                  )}
                                >
                                  <DetailStatusIcon className="w-3.5 h-3.5 shrink-0" />
                                  <span>{detailMeta.label}</span>
                                </span>

                                {selectedTicket.status !== 'resolved' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStatus(selectedTicket, 'resolved')}
                                    className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    Mark Resolved
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStatus(selectedTicket, 'open')}
                                    className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    Reopen Ticket
                                  </button>
                                )}
                              </div>
                            </div>

                            <TicketProgressTracker status={selectedTicket.status} />
                          </div>
                        );
                      })()}

                      {/* Messages Scroll Area */}
                      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[#f6f8f7]/60">
                        {/* Initial Issue Description */}
                        <div className="p-4 rounded-xl bg-white border border-[#bac4c6]/80 space-y-2">
                          <div className="flex items-center justify-between text-xs text-[#6a7f84]">
                            <span className="font-semibold text-[#1f2a2e]">
                              {selectedTicket.submittedByName} ({selectedTicket.submittedByRole})
                            </span>
                            <span className="font-mono tabular-nums">
                              {new Date(selectedTicket.createdAt).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-[#1f2a2e] whitespace-pre-wrap leading-relaxed">
                            {selectedTicket.description}
                          </p>
                        </div>

                        {/* Threaded Replies */}
                        {(selectedTicket.messages || []).map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              'p-4 rounded-xl border space-y-1.5',
                              msg.isCreator
                                ? 'bg-[#1c4a59]/5 border-[#1c4a59]/30 ml-4'
                                : 'bg-white border-slate-200 mr-4'
                            )}
                          >
                            <div className="flex items-center justify-between text-xs text-[#6a7f84]">
                              <span className="font-semibold text-[#1c4a59]">
                                {msg.isCreator
                                  ? `${msg.senderName} · SchoolSphere Support`
                                  : `${msg.senderName} (${msg.senderRole})`}
                              </span>
                              <span className="font-mono tabular-nums">
                                {new Date(msg.createdAt).toLocaleString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <p className="text-sm text-[#1f2a2e] whitespace-pre-wrap leading-relaxed">
                              {msg.text}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Reply Composer */}
                      <form
                        onSubmit={handleSendFollowUp}
                        className="p-4 bg-white border-t border-[#bac4c6] flex items-center gap-2.5 shrink-0"
                      >
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Add a follow-up note or response for SchoolSphere Support..."
                          className="flex-1 px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg text-sm text-[#1f2a2e] focus:outline-hidden focus:border-[#1c4a59]"
                        />
                        <button
                          type="submit"
                          disabled={isSendingReply || !replyText.trim()}
                          className="px-4 py-2 rounded-lg bg-[#1c4a59] hover:bg-[#153945] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5 text-[#faae57]" />
                          <span>{isSendingReply ? 'Sending...' : 'Send Reply'}</span>
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-[#6a7f84]">
                      <LifeBuoy className="w-10 h-10 text-[#1c4a59]/60 stroke-[1.5]" />
                      <div className="max-w-sm space-y-1">
                        <p className="text-sm font-semibold text-[#1f2a2e]">
                          Select a ticket or report a new system issue
                        </p>
                        <p className="text-xs leading-relaxed">
                          Track your reported issues across Pending, In Progress, and Resolved stages in real time.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCreatingNew(true)}
                        className="px-4 py-2 rounded-lg bg-[#1c4a59] hover:bg-[#153945] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#faae57]" />
                        <span>Report System Issue</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
