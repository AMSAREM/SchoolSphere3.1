import React, { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  Bell,
  Globe,
  Smartphone,
  Send,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Search,
  Clock,
  MessageSquare
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  SupportTicket,
  fetchSupportTickets,
  updateSupportTicket,
  deleteSupportTicket
} from '../../lib/supportTicketsApi';

interface ServicesSuiteProps {
  activePanel: string;
  lockAnnouncementMsg: string;
  setLockAnnouncementMsg: (msg: string) => void;
  handleUpdateAnnouncement: () => void;
}

export default function ServicesSuite({
  activePanel,
  lockAnnouncementMsg,
  setLockAnnouncementMsg,
  handleUpdateAnnouncement
}: ServicesSuiteProps) {
  // Live Supabase-synced state for Customer Support Tickets
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Local state for CMS
  const [cmsSchoolName, setCmsSchoolName] = useState('SchoolSphere Portal');
  const [cmsSchoolLogo, setCmsSchoolLogo] = useState('https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png');
  const [cmsTheme, setCmsTheme] = useState('Indigo Tech');

  // Local state for Mobile App
  const [mobileVersion, setMobileVersion] = useState('2.4.0');
  const [mobileApkLink, setMobileApkLink] = useState('https://storage.googleapis.com/schoolsphere-builds/android/v2.4.0-release.apk');
  const [mobilePushEnabled, setMobilePushEnabled] = useState(true);

  const loadCreatorTickets = async (silent = false) => {
    if (!silent) setIsLoadingTickets(true);
    try {
      const list = await fetchSupportTickets({ scope: 'creator', role: 'creator' });
      setSupportTickets(list);
      if (!selectedTicketId && list.length > 0) {
        setSelectedTicketId(list[0].id);
      }
    } finally {
      if (!silent) setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (activePanel === 'customer_support') {
      loadCreatorTickets(false);
      const interval = setInterval(() => loadCreatorTickets(true), 15000);
      const handleSync = () => loadCreatorTickets(true);
      window.addEventListener('schoolsphere_support_tickets_updated', handleSync);
      return () => {
        clearInterval(interval);
        window.removeEventListener('schoolsphere_support_tickets_updated', handleSync);
      };
    }
  }, [activePanel]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return supportTickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (q) {
        const hay = `${t.ticketNumber} ${t.schoolName} ${t.subject} ${t.category} ${t.submittedByName} ${t.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [supportTickets, statusFilter, priorityFilter, searchQuery]);

  const selectedTicket = useMemo(
    () => supportTickets.find((t) => t.id === selectedTicketId) || null,
    [supportTickets, selectedTicketId]
  );

  const ticketStats = useMemo(() => {
    return {
      total: supportTickets.length,
      open: supportTickets.filter((t) => t.status === 'open').length,
      inProgress: supportTickets.filter((t) => t.status === 'in_progress').length,
      resolved: supportTickets.filter((t) => t.status === 'resolved').length
    };
  }, [supportTickets]);

  const showNotice = (msg: string) => {
    setFeedbackNotice(msg);
    setTimeout(() => {
      setFeedbackNotice((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleSendReply = async (ticketId: string, markResolved = false) => {
    if (!replyText.trim() && !markResolved) return;
    setIsSendingReply(true);
    const result = await updateSupportTicket(ticketId, {
      messageText: replyText.trim() || undefined,
      senderName: 'SchoolSphere Team / Emmanuel Amoako',
      senderRole: 'creator',
      isCreator: true,
      status: markResolved ? 'resolved' : undefined
    });
    setIsSendingReply(false);
    if (result.success && result.ticket) {
      setSupportTickets((prev) =>
        prev.map((t) => (t.id === result.ticket!.id ? result.ticket! : t))
      );
      setReplyText('');
      showNotice(
        markResolved
          ? `Reply dispatched and ticket ${result.ticket.ticketNumber} marked as Resolved.`
          : `Official response dispatched to ${result.ticket.schoolName}.`
      );
    }
  };

  const handleStatusChange = async (
    ticketId: string,
    status: 'open' | 'in_progress' | 'resolved'
  ) => {
    const result = await updateSupportTicket(ticketId, { status });
    if (result.success && result.ticket) {
      setSupportTickets((prev) =>
        prev.map((t) => (t.id === result.ticket!.id ? result.ticket! : t))
      );
      showNotice(`Ticket ${result.ticket.ticketNumber} status updated to ${status.replace('_', ' ')}.`);
    }
  };

  const handleDeleteTicket = async (ticketId: string, ticketNumber: string) => {
    const res = await deleteSupportTicket(ticketId);
    if (res.success) {
      setSupportTickets((prev) => prev.filter((t) => t.id !== ticketId));
      if (selectedTicketId === ticketId) {
        setSelectedTicketId(null);
      }
      showNotice(`Ticket ${ticketNumber} removed from queue.`);
    }
  };

  if (activePanel === 'customer_support') {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Customer Support &amp; Issue Ticketing Desk
              </h2>
              <p className="text-xs text-slate-500">
                Two-way Supabase sync with client portals · SchoolSphere Team / Emmanuel Amoako
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadCreatorTickets(false)}
            disabled={isLoadingTickets}
            className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-indigo-600', isLoadingTickets && 'animate-spin')} />
            <span>{isLoadingTickets ? 'Syncing...' : 'Refresh Queue'}</span>
          </button>
        </div>

        {feedbackNotice && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <span>{feedbackNotice}</span>
            <button
              type="button"
              onClick={() => setFeedbackNotice(null)}
              className="text-emerald-600 hover:text-emerald-900 font-bold ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* KPI Summary Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60">
            <p className="text-xs font-medium text-slate-500">Total Client Tickets</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {ticketStats.total}
            </p>
          </div>
          <div className="p-3.5 rounded-2xl border border-amber-200/80 bg-amber-50/40">
            <p className="text-xs font-medium text-amber-800">Open / Unassigned</p>
            <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-0.5">
              {ticketStats.open}
            </p>
          </div>
          <div className="p-3.5 rounded-2xl border border-blue-200/80 bg-blue-50/40">
            <p className="text-xs font-medium text-blue-800">In Progress</p>
            <p className="text-xl font-bold font-mono tabular-nums text-blue-700 mt-0.5">
              {ticketStats.inProgress}
            </p>
          </div>
          <div className="p-3.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/40">
            <p className="text-xs font-medium text-emerald-800">Resolved</p>
            <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {ticketStats.resolved}
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by school, ticket ID (TKT-...), module, or reporter..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              {(['all', 'open', 'in_progress', 'resolved'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap',
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {st === 'all'
                    ? 'All'
                    : st === 'in_progress'
                    ? 'In Progress'
                    : st === 'resolved'
                    ? 'Resolved'
                    : 'Open'}
                </button>
              ))}
            </div>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical Priority</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>
        </div>

        {/* Main Master-Detail Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Inbound Tickets List */}
          <div className="lg:col-span-5 space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {isLoadingTickets && supportTickets.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 text-center space-y-2">
                <MessageSquare className="w-7 h-7 text-slate-400 mx-auto stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-700">No client tickets in this view</p>
                <p className="text-xs text-slate-500">
                  Tickets submitted by school staff and administrators from their portal Support Desk appear here automatically.
                </p>
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={cn(
                      'p-4 rounded-2xl border transition-all cursor-pointer space-y-2',
                      isSelected
                        ? 'bg-indigo-50/50 border-indigo-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span className="font-mono tabular-nums font-bold text-indigo-700">
                          {ticket.ticketNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-800 truncate">
                          {ticket.schoolName}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-xs font-semibold shrink-0 flex items-center gap-1',
                          ticket.status === 'resolved'
                            ? 'text-emerald-600'
                            : ticket.status === 'in_progress'
                            ? 'text-blue-600'
                            : 'text-amber-600'
                        )}
                      >
                        {ticket.status === 'resolved' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {ticket.status === 'in_progress'
                          ? 'In Progress'
                          : ticket.status === 'resolved'
                          ? 'Resolved'
                          : 'Open'}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-slate-900 line-clamp-1">
                      {ticket.subject}
                    </p>

                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{ticket.category}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={cn(
                            'capitalize font-medium',
                            (ticket.priority === 'critical' || ticket.priority === 'high') &&
                              'text-rose-600 font-semibold'
                          )}
                        >
                          {ticket.priority}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{ticket.submittedByName}</span>
                      </div>
                      <span className="font-mono tabular-nums shrink-0">
                        {new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short'
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Ticket Thread & Response Studio */}
          <div className="lg:col-span-7 bg-slate-50/60 border border-slate-200 rounded-2xl flex flex-col min-h-[420px] max-h-[540px] overflow-hidden">
            {selectedTicket ? (
              <>
                {/* Detail Header */}
                <div className="p-4 sm:p-5 bg-white border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                      <span className="font-mono tabular-nums font-bold text-indigo-600">
                        {selectedTicket.ticketNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-800">
                        {selectedTicket.schoolName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedTicket.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {selectedTicket.submittedByName} ({selectedTicket.submittedByRole})
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedTicket.subject}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={selectedTicket.status}
                      onChange={(e) =>
                        handleStatusChange(
                          selectedTicket.id,
                          e.target.value as 'open' | 'in_progress' | 'resolved'
                        )
                      }
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
                    >
                      <option value="open">Status: Open</option>
                      <option value="in_progress">Status: In Progress</option>
                      <option value="resolved">Status: Resolved</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteTicket(selectedTicket.id, selectedTicket.ticketNumber)
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="Delete Ticket"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Conversation Thread */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">
                        {selectedTicket.submittedByName} ({selectedTicket.submittedByRole}) · Initial Report
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
                    <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {selectedTicket.description}
                    </p>
                  </div>

                  {(selectedTicket.messages || []).map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'p-3.5 rounded-xl border space-y-1',
                        msg.isCreator
                          ? 'bg-indigo-50/70 border-indigo-200 ml-6'
                          : 'bg-white border-slate-200 mr-6'
                      )}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-semibold text-slate-900">
                          {msg.isCreator
                            ? `${msg.senderName} (Creator Support)`
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
                      <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {msg.text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Reply Composer */}
                <div className="p-4 bg-white border-t border-slate-200 space-y-2.5">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to ${selectedTicket.submittedByName} at ${selectedTicket.schoolName}...`}
                    rows={2}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 text-xs sm:text-sm text-slate-800 resize-none"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSendingReply || !replyText.trim()}
                      onClick={() => handleSendReply(selectedTicket.id, false)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingReply ? 'Sending...' : 'Dispatch Reply'}</span>
                    </button>
                    {selectedTicket.status !== 'resolved' && (
                      <button
                        type="button"
                        disabled={isSendingReply}
                        onClick={() => handleSendReply(selectedTicket.id, true)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{replyText.trim() ? 'Reply & Resolve' : 'Mark Resolved'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 text-xs font-semibold">
                Select a client support ticket from the queue to inspect the thread and dispatch an official response.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activePanel === 'notifications') {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">System Lock Screen Notice</h2>
            <p className="text-xs text-slate-500">Broadcast customized emergency announcements and warning banners onto locked portals.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-50/50 p-5 rounded-2xl border border-slate-200 space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Lock Screen Message Composer
            </h3>
            <p className="text-xs text-slate-500">
              When a school portal is blocked or suspended, this specific announcement message is displayed directly on the login lock screen:
            </p>

            <textarea
              value={lockAnnouncementMsg}
              onChange={(e) => setLockAnnouncementMsg(e.target.value)}
              placeholder="e.g. Licensing validation required. Please contact SchoolSphere Support on amoakoemmanuel@hotmail.com or 0551187045 / 0554234590."
              rows={4}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium text-xs text-slate-700 focus:outline-hidden resize-none"
            />

            <button
              onClick={handleUpdateAnnouncement}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Update Lockout Message
            </button>
          </div>

          <div className="md:col-span-1 bg-amber-50/20 border border-amber-100 p-5 rounded-2xl flex flex-col justify-between">
            <div className="space-y-3">
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full uppercase">Lock Screen Preview</span>
              <p className="text-[11px] text-slate-600 leading-relaxed font-semibold">
                Below is how locked schools will view your banner:
              </p>
              <div className="p-3.5 bg-white border border-amber-200 rounded-xl space-y-2">
                <span className="text-[10px] font-bold text-rose-500 uppercase flex items-center gap-1">Restricted Instance</span>
                <p className="text-[10px] text-slate-700 italic leading-normal font-semibold">"{lockAnnouncementMsg || 'Please activate licensing...'}"</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activePanel === 'cms') {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">CMS White-Label Branding</h2>
            <p className="text-xs text-slate-500">Configure default school identity properties and custom homepage logos.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Default Landing Portal Title</label>
              <input
                type="text"
                value={cmsSchoolName}
                onChange={(e) => setCmsSchoolName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Default Branding Logo URL</label>
              <input
                type="text"
                value={cmsSchoolLogo}
                onChange={(e) => setCmsSchoolLogo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Core Theme Selection</label>
              <select
                value={cmsTheme}
                onChange={(e) => setCmsTheme(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
              >
                <option value="Indigo Tech">Indigo Tech (Modern Dark / Blue)</option>
                <option value="Forest Green">Forest Green (Eco Classical)</option>
                <option value="Midnight Rose">Midnight Rose (Creative Crimson)</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 flex flex-col justify-between">
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">White-Label Customizer Preview</h4>
              <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center gap-3">
                <img src={cmsSchoolLogo} className="w-8 h-8 object-contain rounded" alt="Logo preview" referrerPolicy="no-referrer" />
                <div>
                  <h5 className="font-bold text-xs text-slate-800">{cmsSchoolName}</h5>
                  <span className="text-[9px] text-slate-400 font-semibold uppercase">{cmsTheme} theme active</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => showNotice('CMS Branding Customizations saved.')}
              className="mt-6 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Update Landing Assets
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activePanel === 'mobile_app_management') {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Mobile App Management</h2>
            <p className="text-xs text-slate-500">Configure APK updates and Google Play release channels for Android student portal.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Play Console Version Build</label>
              <input
                type="text"
                value={mobileVersion}
                onChange={(e) => setMobileVersion(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">APK File Endpoint Link</label>
              <input
                type="text"
                value={mobileApkLink}
                onChange={(e) => setMobileApkLink(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-700 pt-2 select-none">
              <input
                type="checkbox"
                checked={mobilePushEnabled}
                onChange={(e) => setMobilePushEnabled(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Auto-notify mobile users on term results publication
            </label>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 flex flex-col justify-between">
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Android APK release metadata</h4>
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-500 block font-bold uppercase">BUILD ARCHITECTURE</span>
                <span className="text-xs font-mono font-bold text-indigo-600 block">Universal Android arm64-v8a</span>
                <span className="text-[10px] text-slate-500 block font-bold uppercase mt-2">DOWNLOAD ENVELOPE SIZE</span>
                <span className="text-xs font-mono font-bold text-slate-700 block">18.42 MB</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => showNotice('Mobile App Configuration variables updated.')}
              className="mt-6 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Push APK Release Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
