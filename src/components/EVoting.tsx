import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../contexts/AuthContext';
import { db, Poll, Candidate, Vote, Student } from '../db/schema';
import { evotingApi } from '../lib/api';
import {
  Vote as VoteIcon,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Award,
  BarChart4,
  ShieldCheck,
  User,
  UserPlus,
  Search,
  Clock,
  Inbox,
  Check,
  Smartphone,
  RefreshCw,
  Archive,
  BarChart3,
  Flame,
  Fingerprint,
  Database,
  Cloud,
  Upload,
  Copy,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import EVotingAnalytics from './EVotingAnalytics';
import EVotingVotesTable, { EnrichedVoteRow } from './EVotingVotesTable';

export default function EVoting() {
  const { user } = useAuth();
  const canManageElection =
    user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'headteacher';

  // Navigation tabs of E-Voting Screen
  const [activeTab, setActiveTab] = useState<'booth' | 'results' | 'votes_table' | 'admin'>('booth');

  useEffect(() => {
    if (!canManageElection && activeTab === 'admin') {
      setActiveTab('booth');
    }
  }, [canManageElection, activeTab]);

  // Load tables from Dexie (kept synchronized with Supabase via evotingApi)
  const localPolls = useLiveQuery(() => db.polls.toArray());
  const localCandidates = useLiveQuery(() => db.candidates.toArray());
  const localVotes = useLiveQuery(() => db.votes.toArray());
  const localStudents = useLiveQuery(() => db.students.toArray());

  // Cloud state & Supabase Tables inspector state
  const [remotePolls, setRemotePolls] = useState<Poll[] | null>(null);
  const [remoteCandidates, setRemoteCandidates] = useState<Candidate[] | null>(null);
  const [remoteVotes, setRemoteVotes] = useState<EnrichedVoteRow[] | null>(null);
  const [remoteStudents, setRemoteStudents] = useState<Student[] | null>(null);
  const [votesTableSyncMode, setVotesTableSyncMode] = useState<string>('synced_with_public_votes');
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [tableStatus, setTableStatus] = useState<Record<string, any> | null>(null);
  const [evotingSql, setEvotingSql] = useState<string>('');
  const [showTableInspector, setShowTableInspector] = useState(false);

  const polls = remotePolls ?? localPolls ?? [];
  const candidates = remoteCandidates ?? localCandidates ?? [];
  const votes: EnrichedVoteRow[] = remoteVotes ?? (localVotes as EnrichedVoteRow[]) ?? [];
  const students =
    remoteStudents && remoteStudents.length > 0 ? remoteStudents : localStudents ?? [];

  // Active student voter state
  const [voterId, setVoterId] = useState('');
  const [verifiedStudent, setVerifiedStudent] = useState<Student | null>(null);
  const [verifiedVotedPollIds, setVerifiedVotedPollIds] = useState<number[]>([]);
  const [lastCastReceipts, setLastCastReceipts] = useState<string[]>([]);
  const [initialVerifyQuery, setInitialVerifyQuery] = useState<string>('');
  const [isVerifyingVoter, setIsVerifyingVoter] = useState(false);
  const [isCastingBallot, setIsCastingBallot] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  // Voting Booth selection state
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
  const [selectedBallot, setSelectedBallot] = useState<Record<string, number>>({}); // position -> candidateId

  // Admin / Election configuration state
  const [newPollTitle, setNewPollTitle] = useState('');
  const [newPollDesc, setNewPollDesc] = useState('');
  const [newPollCategory, setNewPollCategory] = useState('SRC General Elections');
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [isSavingPoll, setIsSavingPoll] = useState(false);

  // Candidate Registration state
  const [candidatePollId, setCandidatePollId] = useState<number>(0);
  const [candName, setCandName] = useState('');
  const [candPosition, setCandPosition] = useState('President');
  const [candClass, setCandClass] = useState('');
  const [candManifesto, setCandManifesto] = useState('');
  const [candPhotoUrl, setCandPhotoUrl] = useState('');
  const [candPhotoBase64, setCandPhotoBase64] = useState('');
  const [candPhotoMimeType, setCandPhotoMimeType] = useState('image/jpeg');
  const [candPhotoFileName, setCandPhotoFileName] = useState('');
  const [isAddingCandidate, setIsAddingCandidate] = useState(false);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Quick positions list
  const positionsList = [
    'President',
    'General Secretary',
    'SRC Treasurer',
    'Sports Captain',
    'Entertainment Prefect',
    'Class Prefect'
  ];

  // Toast show helper
  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const applyRemoteEvotingPayload = useCallback((data: any) => {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.polls)) setRemotePolls(data.polls);
    if (Array.isArray(data.candidates)) setRemoteCandidates(data.candidates);
    if (Array.isArray(data.votesTable)) {
      setRemoteVotes(data.votesTable);
    } else if (Array.isArray(data.votes)) {
      setRemoteVotes(data.votes);
    }
    if (typeof data.votesTableSyncMode === 'string' && data.votesTableSyncMode) {
      setVotesTableSyncMode(data.votesTableSyncMode);
    }
    if (Array.isArray(data.students) && data.students.length > 0) {
      setRemoteStudents(data.students);
    }
    if (data.tableStatus && typeof data.tableStatus === 'object') {
      setTableStatus(data.tableStatus);
    }
    if (typeof data.evotingSql === 'string' && data.evotingSql) {
      setEvotingSql(data.evotingSql);
    }
    setLastCloudSyncAt(Number(data.syncedAt || Date.now()));
    setCloudError(null);
  }, []);

  const handleCloudSync = useCallback(
    async (notifyUser = false) => {
      setIsCloudSyncing(true);
      try {
        const data = await evotingApi.syncState();
        applyRemoteEvotingPayload(data);
        if (notifyUser) {
          showNotification(
            `Synced ${data.polls?.length || 0} election(s), ${data.candidates?.length || 0} nominee(s), and ${data.votes?.length || 0} vote(s) with Supabase!`,
            'success'
          );
        }
      } catch (err: any) {
        const msg = err?.message || 'Could not reach Supabase E-Voting service';
        setCloudError(msg);
        if (notifyUser) {
          showNotification(msg, 'error');
        }
      } finally {
        setIsCloudSyncing(false);
      }
    },
    [applyRemoteEvotingPayload]
  );

  // Initial two-way cloud synchronization & default SRC election auto-seed on mount
  useEffect(() => {
    handleCloudSync(false);
  }, [handleCloudSync]);

  // Live Standings auto-refresh every 12 seconds when viewing results or booth
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await evotingApi.getState();
        applyRemoteEvotingPayload(data);
      } catch {}
    }, 12000);
    return () => clearInterval(interval);
  }, [applyRemoteEvotingPayload]);

  // Keep default candidatePollId selected when polls load
  useEffect(() => {
    if (!candidatePollId && polls.length > 0 && polls[0]?.id) {
      setCandidatePollId(Number(polls[0].id));
    }
  }, [polls, candidatePollId]);

  // Handle nominee portrait file selection
  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      showNotification('Portrait image must be 6MB or smaller.', 'error');
      return;
    }
    setCandPhotoFileName(file.name);
    setCandPhotoMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCandPhotoBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle student voter search & identity verification against Supabase public.students
  const handleVerifyVoter = async (overrideId?: string) => {
    setVerificationError('');
    const targetId = String(overrideId ?? voterId).trim();
    if (!targetId) {
      setVerificationError('Student ID is required.');
      return;
    }

    setIsVerifyingVoter(true);
    const localMatched = students?.find(
      (s) => String(s.studentId || '').toUpperCase() === targetId.toUpperCase()
    );

    try {
      const res = await evotingApi.verifyVoter(targetId, localMatched);
      const verified = res.student || localMatched;
      if (!verified) {
        setVerificationError(
          'No matching student found with that ID card. Please verify your Student ID.'
        );
        setVerifiedStudent(null);
        return;
      }
      setVerifiedStudent(verified);
      if (Array.isArray(res.votedPollIds)) {
        setVerifiedVotedPollIds(res.votedPollIds.map((id: any) => Number(id)));
      }
      showNotification(
        `Identity Verified in Supabase: Welcome ${verified.firstName} ${verified.lastName || ''}!`,
        'success'
      );
    } catch (err: any) {
      if (localMatched) {
        setVerifiedStudent(localMatched);
        showNotification(`Identity Verified: Welcome ${localMatched.firstName}!`, 'success');
      } else {
        setVerificationError(
          err?.message ||
            'No matching student found with that ID card. Please verify your Student ID.'
        );
        setVerifiedStudent(null);
      }
    } finally {
      setIsVerifyingVoter(false);
    }
  };

  // Reset current voter session
  const logoutVoter = () => {
    setVerifiedStudent(null);
    setVerifiedVotedPollIds([]);
    setVoterId('');
    setSelectedPollId(null);
    setSelectedBallot({});
    setVerificationError('');
  };

  // Get active polls list
  const activePolls = polls.filter((p) => p.status === 'active');

  // Filter candidates running in selected poll
  const activePollCandidates = candidates.filter((c) => Number(c.pollId) === Number(selectedPollId));

  // Categorize candidates of current poll by position
  const candidatesByPosition = activePollCandidates.reduce((acc, cand) => {
    if (!acc[cand.position]) {
      acc[cand.position] = [];
    }
    acc[cand.position].push(cand);
    return acc;
  }, {} as Record<string, Candidate[]>);

  // Check if voter has already submitted a ballot for selected Poll (both Supabase votedPollIds & votes list)
  const studentHasVotedThisPoll = (pollId: number, studentId: string) => {
    if (verifiedVotedPollIds.includes(Number(pollId))) return true;
    if (!votes) return false;
    return votes.some(
      (v) =>
        Number(v.pollId) === Number(pollId) &&
        String(v.studentId || '').toUpperCase() === String(studentId || '').toUpperCase()
    );
  };

  // Process and submit Student vote selection to Supabase
  const handleCastBallot = async () => {
    if (!verifiedStudent || !selectedPollId || isCastingBallot) return;

    if (studentHasVotedThisPoll(selectedPollId, verifiedStudent.studentId)) {
      showNotification('Access denied: Student has already cast their ballot!', 'error');
      return;
    }

    const positionsToVote = Object.keys(candidatesByPosition);
    if (positionsToVote.length === 0) {
      showNotification('This election does not have any nominees active.', 'error');
      return;
    }

    // Ensure they selected someone for each position
    const incompleteSelection = positionsToVote.some((pos) => !selectedBallot[pos]);
    if (incompleteSelection) {
      showNotification('Please select a preferred candidate for all positions.', 'error');
      return;
    }

    setIsCastingBallot(true);
    try {
      const data = await evotingApi.castVote({
        pollId: selectedPollId,
        studentId: verifiedStudent.studentId,
        selections: selectedBallot,
        student: verifiedStudent
      });

      applyRemoteEvotingPayload(data);
      if (Array.isArray(data.receiptCodes) && data.receiptCodes.length > 0) {
        setLastCastReceipts(data.receiptCodes);
      } else if (Array.isArray(data.votesCast) && data.votesCast.length > 0) {
        setLastCastReceipts(
          data.votesCast.map((v: any) => String(v.receiptCode || v.receipt_code || '')).filter(Boolean)
        );
      }
      setVerifiedVotedPollIds((prev) =>
        prev.includes(Number(selectedPollId)) ? prev : [...prev, Number(selectedPollId)]
      );
      setSelectedBallot({});
      showNotification(
        'Ballot securely recorded in Supabase votes_table & votes! Parental SMS audit log created.',
        'success'
      );
    } catch (err: any) {
      if (err?.alreadyVoted) {
        setVerifiedVotedPollIds((prev) =>
          prev.includes(Number(selectedPollId)) ? prev : [...prev, Number(selectedPollId)]
        );
      }
      showNotification(err?.message || 'Error processing secure ballot transaction.', 'error');
    } finally {
      setIsCastingBallot(false);
    }
  };

  // ADMIN OPERATIONS
  // Create election poll in Supabase
  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPollTitle.trim() || isSavingPoll) return;

    setIsSavingPoll(true);
    try {
      const data = await evotingApi.createPoll({
        title: newPollTitle.trim(),
        description: newPollDesc.trim(),
        category: newPollCategory.trim() || 'SRC General Elections',
        status: 'draft'
      });
      applyRemoteEvotingPayload(data);
      if (data.poll?.id) {
        setCandidatePollId(Number(data.poll.id));
      }
      setNewPollTitle('');
      setNewPollDesc('');
      setIsCreatingPoll(false);
      showNotification('New Election created in Supabase (draft state)!', 'success');
    } catch (err: any) {
      showNotification(err?.message || 'Could not record poll config.', 'error');
    } finally {
      setIsSavingPoll(false);
    }
  };

  // Delete election poll from Supabase
  const handleDeletePoll = async (id: number) => {
    if (
      !confirm(
        'Are you sure you want to delete this election entirely? Candidates and cast votes will be cleared from Supabase.'
      )
    )
      return;
    try {
      const data = await evotingApi.deletePoll(id);
      applyRemoteEvotingPayload(data);
      showNotification('Election deleted from Supabase.', 'success');
      if (selectedPollId === id) setSelectedPollId(null);
    } catch (err: any) {
      showNotification(err?.message || 'Delete transaction error.', 'error');
    }
  };

  // Change poll states (draft -> active -> completed) in Supabase
  const handleTogglePollStatus = async (id: number, currentStatus: string) => {
    const nextStatus =
      currentStatus === 'draft' ? 'active' : currentStatus === 'active' ? 'completed' : 'draft';
    try {
      const data = await evotingApi.updatePoll(id, { status: nextStatus });
      applyRemoteEvotingPayload(data);
      showNotification(`Election status updated to "${nextStatus.toUpperCase()}" in Supabase!`, 'success');
    } catch (err: any) {
      showNotification(err?.message || 'Could not update state.', 'error');
    }
  };

  // Register Candidate in Supabase (with Supabase Storage photo upload)
  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidatePollId || !candName.trim() || !candClass.trim()) {
      showNotification('Please select an election and fill out all nominee fields.', 'error');
      return;
    }
    if (isSavingCandidate) return;

    setIsSavingCandidate(true);
    try {
      const data = await evotingApi.addCandidate({
        pollId: Number(candidatePollId),
        name: candName.trim(),
        position: candPosition,
        class: candClass.trim(),
        manifesto:
          candManifesto.trim() || 'Pledge to serve students body with core integrity.',
        photo:
          candPhotoUrl.trim() ||
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80',
        photoBase64: candPhotoBase64 || undefined,
        photoMimeType: candPhotoMimeType
      });

      applyRemoteEvotingPayload(data);
      setCandName('');
      setCandClass('');
      setCandManifesto('');
      setCandPhotoUrl('');
      setCandPhotoBase64('');
      setCandPhotoFileName('');
      setCandPosition('President');
      setIsAddingCandidate(false);
      showNotification('Nominee registered in Supabase!', 'success');
    } catch (err: any) {
      showNotification(err?.message || 'Error registering nominee.', 'error');
    } finally {
      setIsSavingCandidate(false);
    }
  };

  // Delete nominee from Supabase
  const handleDeleteCandidate = async (id: number) => {
    if (!confirm('Are you sure you want to remove this candidate nomination?')) return;
    try {
      const data = await evotingApi.deleteCandidate(id);
      applyRemoteEvotingPayload(data);
      showNotification('Nominee removed from Supabase.', 'success');
    } catch (err: any) {
      showNotification(err?.message || 'Nominee deletion error.', 'error');
    }
  };

  const handleCopyEvotingSql = async () => {
    if (!evotingSql) return;
    try {
      await navigator.clipboard.writeText(evotingSql);
      showNotification('Supabase E-Voting SQL copied to clipboard!', 'success');
    } catch {
      showNotification('Could not copy SQL to clipboard.', 'error');
    }
  };

  // Get first available poll if none selected in results list
  const activeResultsPollId =
    selectedPollId || (polls && polls.length > 0 ? Number(polls[0].id) : null);
  const activeResultsPoll = polls.find((p) => Number(p.id) === Number(activeResultsPollId));
  const activeResultsCandidates = candidates.filter(
    (c) => Number(c.pollId) === Number(activeResultsPollId)
  );

  // Group results candidates by position
  const resultsByPosition = activeResultsCandidates.reduce((acc, c) => {
    if (!acc[c.position]) acc[c.position] = [];
    acc[c.position].push(c);
    return acc;
  }, {} as Record<string, typeof activeResultsCandidates>);

  const totalUniqueVotersInActivePoll = Array.from(
    new Set(
      votes
        .filter((v) => Number(v.pollId) === Number(activeResultsPollId))
        .map((v) => String(v.studentId || '').toUpperCase())
    )
  ).length;

  const turnoutPercentage =
    students && students.length > 0
      ? Math.min(100, Math.round((totalUniqueVotersInActivePoll / students.length) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg border text-white text-xs font-bold font-sans flex items-center gap-2 ${
              toastMsg.type === 'success'
                ? 'bg-emerald-600 border-emerald-500'
                : 'bg-rose-600 border-rose-500'
            }`}
          >
            {toastMsg.type === 'success' ? (
              <ShieldCheck className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {toastMsg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Visual Hero */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl border border-slate-800">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-indigo-300 tracking-wide">
              <Fingerprint className="w-4 h-4 text-indigo-400" />
              <span>SUPABASE MULTI-TERMINAL ELECTION LEDGER</span>
              <span aria-hidden="true">·</span>
              <span className={cloudError ? 'text-amber-300' : 'text-emerald-400'}>
                {isCloudSyncing
                  ? 'Syncing with Supabase...'
                  : cloudError
                  ? 'Local Cache Active'
                  : 'Supabase Cloud Synced'}
              </span>
              {lastCloudSyncAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400 font-mono">
                    {new Date(lastCloudSyncAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-none">
              SchoolSphere Digital <span className="text-indigo-400">E-Voting</span> Suite
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-lg font-medium">
              Authenticated student ballot verification against Supabase, nominee portrait storage,
              and live cross-device election standings with automated parent SMS and security audit
              logs.
            </p>
          </div>

          {/* Cloud Sync & Supabase Tables Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowTableInspector((prev) => !prev)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all whitespace-nowrap ${
                showTableInspector
                  ? 'bg-indigo-600/20 border-indigo-400 text-indigo-200'
                  : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Supabase Tables</span>
            </button>

            <button
              type="button"
              onClick={() => handleCloudSync(true)}
              disabled={isCloudSyncing}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white flex items-center gap-2 transition-all shadow-sm whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
              <span>{isCloudSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
            </button>
          </div>
        </div>

        {/* Inspectable Supabase Tables Status Drawer */}
        <AnimatePresence>
          {showTableInspector && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-5 border-t border-slate-800/90 space-y-4 relative z-10"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-emerald-400" /> Connected Supabase Database
                    Tables (E-Voting Portal)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    All elections, nominee slates, student voter records, cast ballots, and SMS
                    confirmations are stored in your Supabase PostgreSQL tables and mirrored to{' '}
                    <code className="text-indigo-300">public.school_settings</code>.
                  </p>
                </div>
                {evotingSql && (
                  <button
                    type="button"
                    onClick={handleCopyEvotingSql}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5 text-indigo-400" /> Copy E-Voting SQL
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-300">public.polls</span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      {tableStatus?.polls?.exists !== false ? 'READY' : 'FALLBACK'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Election events, categories &amp; status ({polls.length} active/draft)
                  </p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-300">public.candidates</span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      {tableStatus?.candidates?.exists !== false ? 'READY' : 'FALLBACK'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Nominees, manifestos, photos &amp; tallies ({candidates.length} registered)
                  </p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-300">
                      public.votes_table &amp; votes
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      {tableStatus?.votes_table?.exists !== false ? 'SYNCED' : 'READY'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Dual-synced ballot ledger &amp; receipts ({votes.length} cast ballots)
                  </p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-300">
                      public.students &amp; sms_logs
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">READY</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Voter ID registry ({students.length} students) &amp; parent SMS audit logs
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Controls */}
        <div className="flex flex-wrap gap-2 mt-8 border-t border-slate-800/80 pt-4 relative z-10 font-sans">
          <button
            onClick={() => setActiveTab('booth')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'booth'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <VoteIcon className="w-4 h-4" /> Voting Booth
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'results'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Live Standings
          </button>
          <button
            onClick={() => setActiveTab('votes_table')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'votes_table'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Votes Table (votes_table)</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black ${
                activeTab === 'votes_table'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-800 text-emerald-400'
              }`}
            >
              {votes.length}
            </span>
          </button>
          {canManageElection && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'admin'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Admin Console
            </button>
          )}
        </div>
      </div>

      {/* Primary Tab View Contents */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-1 gap-6"
        >
          {/* ==================== 1. VOTING BOOTH ==================== */}
          {activeTab === 'booth' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Voter Registration Identity Verification Column */}
              <div className="lg:col-span-1 space-y-4">
                {!verifiedStudent ? (
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 outline-none shadow-sm space-y-4">
                    <div className="flex items-center gap-3 space-y-1">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <Fingerprint className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                          Identity Screening
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold">
                          Verified against Supabase public.students
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Active Student ID
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={voterId}
                          onChange={(e) => setVoterId(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleVerifyVoter();
                          }}
                          placeholder="e.g. STU-051320"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl font-mono font-bold text-xs outline-none uppercase"
                        />
                      </div>
                      {verificationError && (
                        <p className="text-[10px] text-rose-600 font-bold flex items-center gap-1.5 mt-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {verificationError}
                        </p>
                      )}
                    </div>

                    {/* Quick-Select Student Helper from Supabase Roster */}
                    {students.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Or Select Enrolled Student ({students.length} in Supabase)
                        </label>
                        <select
                          value=""
                          onChange={(e) => {
                            const chosenId = e.target.value;
                            if (chosenId) {
                              setVoterId(chosenId);
                              handleVerifyVoter(chosenId);
                            }
                          }}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                        >
                          <option value="">Quick-pick a registered student...</option>
                          {students.slice(0, 50).map((s) => (
                            <option key={s.studentId} value={s.studentId}>
                              {s.studentId} — {s.firstName} {s.lastName} ({s.class})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <p className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-200/50 leading-relaxed font-medium">
                      <b className="text-slate-600 font-bold">Server-side double-vote guard:</b>{' '}
                      Supabase enforces a strict unique constraint per student and election poll.
                    </p>

                    <button
                      onClick={() => handleVerifyVoter()}
                      disabled={isVerifyingVoter}
                      className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl py-3 font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      {isVerifyingVoter ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Verifying in Supabase...</span>
                        </>
                      ) : (
                        <span>Authenticate Account</span>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-4">
                      {verifiedStudent.photo ? (
                        <img
                          src={verifiedStudent.photo}
                          alt="Voter"
                          className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100 shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 uppercase font-black font-sans shrink-0">
                          {verifiedStudent.firstName?.[0] || ''}
                          {verifiedStudent.lastName?.[0] || 'V'}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <b className="text-sm font-extrabold text-slate-900 leading-tight block">
                            {verifiedStudent.firstName} {verifiedStudent.lastName}
                          </b>
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                            · VERIFIED
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 font-mono mt-0.5">
                          ID: {verifiedStudent.studentId} · Class: {verifiedStudent.class}
                        </p>
                      </div>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center bg-slate-50 border border-slate-200/50 p-2.5 rounded-xl">
                        <span className="text-slate-500 font-bold">Audit Phone</span>
                        <span className="font-mono text-slate-800 font-bold">
                          {verifiedStudent.guardianPhone || '0241234567'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50 border border-slate-200/50 p-2.5 rounded-xl">
                        <span className="text-slate-500 font-bold">Votes Recorded</span>
                        <span className="font-mono font-extrabold text-indigo-600">
                          {
                            votes.filter(
                              (v) =>
                                String(v.studentId || '').toUpperCase() ===
                                String(verifiedStudent.studentId || '').toUpperCase()
                            ).length
                          }
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={logoutVoter}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 font-extrabold text-xs uppercase tracking-wider transition-all"
                    >
                      Exit Session
                    </button>
                  </div>
                )}

                {/* Helpful Legend */}
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-2.5">
                  <h4 className="text-[11px] font-black uppercase text-slate-600 tracking-wider">
                    Instructions
                  </h4>
                  <ul className="text-[10px] text-slate-500 space-y-1.5 list-disc pl-4 font-medium leading-relaxed">
                    <li>Students must present their individual student identity card values.</li>
                    <li>Verify details then locate any ongoing school representative elections.</li>
                    <li>
                      Select one candidate per position and submit your ballot to Supabase.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Elections & Balloting Column */}
              <div className="lg:col-span-2 space-y-6">
                {!verifiedStudent ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center flex flex-col items-center justify-center space-y-4 shadow-sm min-h-[300px]">
                    <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200">
                      <Fingerprint className="w-7 h-7 text-slate-400" />
                    </div>
                    <div className="max-w-md space-y-1">
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                        Access Locked
                      </h4>
                      <p className="text-xs text-slate-400 font-medium">
                        Please authenticate a Student ID card on the left panel to load active
                        ballots from Supabase and cast your official vote securely.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Choose active poll */}
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                      <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                        1. SELECT ELECTION EVENT
                      </h3>
                      {activePolls.length === 0 ? (
                        <div className="p-4 bg-slate-50 border border-slate-100 text-slate-500 rounded-xl text-center text-xs">
                          No active elections/polls currently ongoing at this moment.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2.5">
                          {activePolls.map((p) => {
                            const voted = studentHasVotedThisPoll(
                              p.id!,
                              verifiedStudent.studentId
                            );
                            const isSelected = Number(selectedPollId) === Number(p.id);
                            return (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setSelectedPollId(Number(p.id!));
                                  setSelectedBallot({});
                                }}
                                className={`p-4 rounded-xl text-left border transition-all flex justify-between items-center shadow-sm w-full outline-none ${
                                  isSelected
                                    ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/10'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="space-y-1 max-w-sm sm:max-w-md">
                                  <div className="flex items-center gap-2 text-[10px] font-bold">
                                    <span className="text-slate-600 uppercase tracking-wider">
                                      {p.category}
                                    </span>
                                    <span aria-hidden="true" className="text-slate-300">
                                      ·
                                    </span>
                                    {voted ? (
                                      <span className="text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Completed
                                      </span>
                                    ) : (
                                      <span className="text-amber-600 uppercase tracking-wider">
                                        Open Ballot
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-xs font-black text-slate-900 block truncate">
                                    {p.title}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 truncate">
                                    {p.description}
                                  </p>
                                </div>
                                <div className="shrink-0 pl-3">
                                  <div
                                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                      isSelected
                                        ? 'border-indigo-600 bg-indigo-600'
                                        : 'border-slate-300'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Ballots nominees list */}
                    {selectedPollId &&
                      !studentHasVotedThisPoll(selectedPollId, verifiedStudent.studentId) && (
                        <div className="space-y-6">
                          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                              2. NOMINEE BALLOT PREFERENCES
                            </h3>

                            {Object.keys(candidatesByPosition).length === 0 ? (
                              <div className="p-4 bg-slate-50 border border-slate-100 text-slate-500 rounded-xl text-center text-xs">
                                No candidates registered in this election yet.
                              </div>
                            ) : (
                              <div className="space-y-6">
                                {Object.entries(candidatesByPosition).map(([position, list]) => (
                                  <div key={position} className="space-y-3 pt-2">
                                    <div className="flex items-center gap-2">
                                      <span className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                                      <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest font-mono">
                                        {position}
                                      </h4>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                      {list.map((cand) => {
                                        const isPicked =
                                          Number(selectedBallot[position]) === Number(cand.id);
                                        return (
                                          <button
                                            key={cand.id}
                                            type="button"
                                            onClick={() =>
                                              setSelectedBallot((prev) => ({
                                                ...prev,
                                                [position]: Number(cand.id!)
                                              }))
                                            }
                                            className={`p-4 rounded-2xl border text-left flex flex-col gap-3.5 transition-all outline-none w-full shadow-sm relative overflow-hidden ${
                                              isPicked
                                                ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-500/15'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                            }`}
                                          >
                                            {isPicked && (
                                              <div className="absolute top-0 right-0 bg-indigo-600 text-white rounded-bl-xl p-1.5">
                                                <Check className="w-3.5 h-3.5" />
                                              </div>
                                            )}

                                            <div className="flex items-center gap-3">
                                              {cand.photo ? (
                                                <img
                                                  src={cand.photo}
                                                  alt={cand.name}
                                                  className="w-10 h-10 rounded-full object-cover border border-slate-200"
                                                  referrerPolicy="no-referrer"
                                                />
                                              ) : (
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-mono font-bold text-xs shrink-0">
                                                  {cand.name?.[0] || 'C'}
                                                </div>
                                              )}
                                              <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-slate-900 truncate leading-none">
                                                  {cand.name}
                                                </p>
                                                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase font-mono">
                                                  Class: {cand.class}
                                                </p>
                                              </div>
                                            </div>

                                            <p className="text-[10px] text-slate-500 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 font-medium leading-relaxed italic">
                                              &ldquo;{cand.manifesto}&rdquo;
                                            </p>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Submit Button */}
                          <div className="bg-slate-100 border border-slate-200/60 p-4 rounded-2xl flex flex-col sm:flex-row gap-3 justify-between items-center">
                            <p className="text-[10px] text-slate-500 text-center sm:text-left leading-relaxed font-semibold max-w-sm">
                              By clicking below, your ballot preferences will be committed to
                              Supabase <code className="font-mono">public.votes</code>. This
                              operation is encrypted and final.
                            </p>
                            <button
                              onClick={handleCastBallot}
                              disabled={isCastingBallot}
                              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider shadow-md transition-all whitespace-nowrap flex items-center gap-2"
                            >
                              {isCastingBallot ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Recording Ballot...</span>
                                </>
                              ) : (
                                <span>Submit Secure Ballot</span>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Voted success confirmation */}
                    {selectedPollId &&
                      studentHasVotedThisPoll(selectedPollId, verifiedStudent.studentId) && (
                        <div className="bg-white rounded-2xl p-8 border border-emerald-100 shadow-sm text-center flex flex-col items-center justify-center space-y-4">
                          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                            <ShieldCheck className="w-7 h-7" />
                          </div>
                          <div className="max-w-md space-y-1.5">
                            <h4 className="text-sm font-black text-emerald-950 uppercase tracking-wider">
                              Ballot Successfully Recorded in Supabase votes_table
                            </h4>
                            <p className="text-xs text-slate-500 leading-relaxed font-bold">
                              You have completed the voting cycle for this election event!
                              Server-side double-voting constraints prevent any additional
                              submissions using Student ID{' '}
                              <span className="text-indigo-600 font-mono">
                                {verifiedStudent.studentId}
                              </span>
                              . Thank you for voting!
                            </p>
                          </div>

                          {/* Voter Ballot Receipts from votes_table */}
                          {(() => {
                            const studentVotesInPoll = votes.filter(
                              (v) =>
                                Number(v.pollId) === Number(selectedPollId) &&
                                String(v.studentId || '').toUpperCase() ===
                                  String(verifiedStudent.studentId || '').toUpperCase()
                            );
                            const receiptsToShow =
                              studentVotesInPoll.length > 0
                                ? studentVotesInPoll.map(
                                    (v) =>
                                      v.receiptCode ||
                                      v.receipt_code ||
                                      `EV-${v.pollId}-${String(v.position || 'POS').slice(0, 3).toUpperCase()}-${String(v.id || 1).padStart(4, '0')}`
                                  )
                                : lastCastReceipts;

                            return (
                              <div className="w-full max-w-md bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-2.5">
                                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                                  Official Supabase votes_table Receipt Code(s)
                                </div>
                                {receiptsToShow.length > 0 && (
                                  <div className="flex flex-wrap items-center justify-center gap-2">
                                    {receiptsToShow.map((rc) => (
                                      <span
                                        key={rc}
                                        className="font-mono text-xs font-black bg-white border border-emerald-300 text-emerald-900 px-3 py-1 rounded-lg shadow-2xs"
                                      >
                                        {rc}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInitialVerifyQuery(
                                        receiptsToShow[0] || verifiedStudent.studentId
                                      );
                                      setActiveTab('votes_table');
                                    }}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black inline-flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                                  >
                                    <Database className="w-3.5 h-3.5" />
                                    Verify in Supabase votes_table Ledger
                                  </button>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="text-xs font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200/50 text-slate-500 inline-block font-semibold">
                            Supabase votes_table + votes synced · Parental SMS confirmation log created
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== 2. LIVE STANDINGS / GRAPHICS ==================== */}
          {activeTab === 'results' && (
            <EVotingAnalytics
              polls={polls}
              candidates={candidates}
              votes={votes}
              students={students}
              selectedPollId={activeResultsPollId}
              onSelectPoll={(id) => setSelectedPollId(id)}
              onRefresh={() => handleCloudSync(true)}
              isSyncing={isCloudSyncing}
              lastSyncedAt={lastCloudSyncAt}
            />
          )}

          {/* ==================== 3. SUPABASE VOTES_TABLE LEDGER ==================== */}
          {activeTab === 'votes_table' && (
            <EVotingVotesTable
              polls={polls}
              candidates={candidates}
              votes={votes}
              students={students}
              selectedPollId={activeResultsPollId}
              onSelectPollId={(id) => setSelectedPollId(id)}
              isAdmin={Boolean(canManageElection)}
              isSyncing={isCloudSyncing}
              votesTableSyncMode={votesTableSyncMode}
              evotingSql={evotingSql}
              onRefreshState={handleCloudSync}
              onStatePayloadUpdated={applyRemoteEvotingPayload}
              initialVerifyQuery={initialVerifyQuery}
            />
          )}

          {/* ==================== 4. ADMIN / MANAGEMENT CONSOLE ==================== */}
          {activeTab === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Poll setup and candidate injection tools */}
              <div className="lg:col-span-1 space-y-4">
                {/* 3.1 Create Election Form */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest font-mono">
                      Create Election
                    </h3>
                    <button
                      onClick={() => setIsCreatingPoll(!isCreatingPoll)}
                      className="text-indigo-600 hover:text-indigo-800 text-[10px] font-black uppercase tracking-wider"
                    >
                      {isCreatingPoll ? 'Hide' : '+ Quick Add'}
                    </button>
                  </div>

                  {isCreatingPoll && (
                    <form onSubmit={handleCreatePoll} className="space-y-3.5 pt-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Election Title
                        </label>
                        <input
                          type="text"
                          required
                          value={newPollTitle}
                          onChange={(e) => setNewPollTitle(e.target.value)}
                          placeholder="e.g. SRC President Elections"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-xs font-bold outline-none font-sans"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Category Type
                        </label>
                        <input
                          type="text"
                          value={newPollCategory}
                          onChange={(e) => setNewPollCategory(e.target.value)}
                          placeholder="e.g. Prefects Selection"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-xs font-bold outline-none font-sans"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Short Description
                        </label>
                        <textarea
                          value={newPollDesc}
                          onChange={(e) => setNewPollDesc(e.target.value)}
                          placeholder="General instructions for students..."
                          rows={2}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-xs font-bold outline-none font-sans resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSavingPoll}
                        className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl py-2.5 font-bold text-xs uppercase tracking-wider transition-all"
                      >
                        {isSavingPoll ? 'Saving to Supabase...' : 'Publish Draft Tally'}
                      </button>
                    </form>
                  )}
                </div>

                {/* 3.2 Candidate Injection Form with Supabase Storage Portrait Upload */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest font-mono">
                      Register Nominee
                    </h3>
                    <button
                      onClick={() => setIsAddingCandidate(!isAddingCandidate)}
                      className="text-indigo-600 hover:text-indigo-800 text-[10px] font-black uppercase tracking-wider"
                    >
                      {isAddingCandidate ? 'Minimize' : '+ Inject'}
                    </button>
                  </div>

                  {isAddingCandidate && (
                    <form onSubmit={handleAddCandidate} className="space-y-3.5 pt-2">
                      <div className="space-y-1 font-semibold">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Select Target Election
                        </label>
                        <select
                          value={candidatePollId}
                          onChange={(e) => setCandidatePollId(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                        >
                          <option value={0}>Choose election...</option>
                          {polls.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Nominee Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={candName}
                          onChange={(e) => setCandName(e.target.value)}
                          placeholder="Elizabeth Mensah"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-xs font-bold outline-none font-sans"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1 font-semibold">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            Position Desk
                          </label>
                          <select
                            value={candPosition}
                            onChange={(e) => setCandPosition(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                          >
                            {positionsList.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            Class Code
                          </label>
                          <input
                            type="text"
                            required
                            value={candClass}
                            onChange={(e) => setCandClass(e.target.value)}
                            placeholder="e.g. JHS 1"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-xs font-bold outline-none font-sans uppercase"
                          />
                        </div>
                      </div>

                      {/* Candidate Portrait Upload (Supabase Storage) */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Nominee Portrait (Supabase Storage)
                        </label>
                        <input
                          ref={photoFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoFileChange}
                          className="hidden"
                        />
                        <div className="flex items-center gap-2.5">
                          {candPhotoBase64 || candPhotoUrl ? (
                            <img
                              src={candPhotoBase64 || candPhotoUrl}
                              alt="Preview"
                              className="w-10 h-10 rounded-full object-cover border border-indigo-200 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => photoFileInputRef.current?.click()}
                            className="flex-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors truncate"
                          >
                            <Upload className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span className="truncate">
                              {candPhotoFileName || 'Upload Portrait Image'}
                            </span>
                          </button>
                        </div>
                        <input
                          type="url"
                          value={candPhotoUrl}
                          onChange={(e) => setCandPhotoUrl(e.target.value)}
                          placeholder="Or paste image URL (optional)..."
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-[11px] font-medium outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Nominee Manifesto
                        </label>
                        <textarea
                          value={candManifesto}
                          onChange={(e) => setCandManifesto(e.target.value)}
                          placeholder="Brief pledge / vision points..."
                          rows={2}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-xs font-bold outline-none font-sans resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSavingCandidate}
                        className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl py-2.5 font-bold text-xs uppercase tracking-wider transition-all"
                      >
                        {isSavingCandidate ? 'Uploading & Saving...' : 'Register Nominee'}
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Elections and registered nominees listing board */}
              <div className="lg:col-span-2 space-y-6">
                {/* list elections */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                    Active Elections Control (Supabase)
                  </h3>

                  {polls.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-xs">
                      No school elections set up yet. Use the left panel to issue one.
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {polls.map((p) => {
                        const associatedCandidates = candidates.filter(
                          (c) => Number(c.pollId) === Number(p.id)
                        );
                        return (
                          <div
                            key={p.id}
                            className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row gap-2.5 justify-between items-start sm:items-center">
                              <div>
                                <h4 className="text-xs font-black text-slate-800 block">
                                  {p.title}
                                </h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase font-mono mt-0.5">
                                  Category: {p.category} · Candidates: {associatedCandidates.length}
                                </p>
                              </div>

                              <div className="flex gap-1.5 self-end sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePollStatus(p.id!, p.status)}
                                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all select-none whitespace-nowrap ${
                                    p.status === 'draft'
                                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
                                      : p.status === 'active'
                                      ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300'
                                      : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border-indigo-300'
                                  }`}
                                >
                                  Status: {p.status}
                                </button>
                                <button
                                  onClick={() => handleDeletePoll(p.id!)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-rose-100"
                                  title="Delete election entirely"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Candidate nominations roster inside election */}
                            {associatedCandidates.length > 0 && (
                              <div className="pt-2 border-t border-slate-200/50 space-y-1.5">
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                  Nominee Slate
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {associatedCandidates.map((cand) => (
                                    <div
                                      key={cand.id}
                                      className="bg-white px-3 py-2 rounded-xl border border-slate-200/60 flex justify-between items-center text-xs shadow-sm"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                                        {cand.photo ? (
                                          <img
                                            src={cand.photo}
                                            alt={cand.name}
                                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-mono font-bold text-[10px] shrink-0">
                                            {cand.name?.[0] || 'C'}
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <p className="font-extrabold text-slate-800 truncate leading-tight">
                                            {cand.name}
                                          </p>
                                          <p className="text-[9px] text-slate-400 font-bold font-mono tracking-wider uppercase mt-0.5 flex items-center gap-1.5">
                                            <span>Class {cand.class}</span> ·{' '}
                                            <span className="text-indigo-600">{cand.position}</span>
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-mono text-[10px] font-black text-indigo-700 tabular-nums">
                                          {cand.votesCount} vo
                                        </span>
                                        <button
                                          onClick={() => handleDeleteCandidate(cand.id!)}
                                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
