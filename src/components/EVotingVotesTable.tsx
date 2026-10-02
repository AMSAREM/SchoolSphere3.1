import React, { useState, useMemo } from 'react';
import { Poll, Candidate, Vote, Student } from '../db/schema';
import { evotingApi } from '../lib/api';
import { triggerPrint } from '../lib/utils';
import {
  Database,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  Printer,
  Download,
  Copy,
  Check,
  AlertTriangle,
  FileCheck2,
  Calculator,
  Clock,
  UserCheck,
  Award,
  X,
  Terminal,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

export interface EnrichedVoteRow extends Vote {
  receiptCode?: string;
  receipt_code?: string;
  studentName?: string;
  student_name?: string;
  studentClass?: string;
  student_class?: string;
  studentGender?: string;
  student_gender?: string;
  candidateName?: string;
  candidate_name?: string;
  candidatePhoto?: string;
  pollTitle?: string;
  poll_title?: string;
  sourceTable?: string;
}

interface EVotingVotesTableProps {
  polls: Poll[];
  candidates: Candidate[];
  votes: EnrichedVoteRow[];
  students: Student[];
  selectedPollId: number | null;
  onSelectPollId: (id: number) => void;
  isAdmin: boolean;
  isSyncing: boolean;
  votesTableSyncMode?: string;
  evotingSql?: string;
  onRefreshState: (silent?: boolean) => Promise<void>;
  onStatePayloadUpdated: (data: any) => void;
  initialVerifyQuery?: string;
}

const buildFallbackReceipt = (v: EnrichedVoteRow) => {
  if (v.receiptCode || v.receipt_code) return String(v.receiptCode || v.receipt_code);
  const cleanStu = String(v.studentId || 'STU')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(-4)
    .padStart(4, '0');
  const posCode = String(v.position || 'POS')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');
  const seq = v.id ? String(v.id).padStart(4, '0') : '0001';
  return `EV-${v.pollId}-${posCode}-${seq}-${cleanStu}`;
};

export const EVotingVotesTable: React.FC<EVotingVotesTableProps> = ({
  polls,
  candidates,
  votes,
  students,
  selectedPollId,
  onSelectPollId,
  isAdmin,
  isSyncing,
  votesTableSyncMode = 'synced_with_public_votes',
  evotingSql,
  onRefreshState,
  onStatePayloadUpdated,
  initialVerifyQuery = ''
}) => {
  const [pollFilter, setPollFilter] = useState<string>(
    selectedPollId ? String(selectedPollId) : 'ALL'
  );
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ballot Receipt & Student ID Lookup Verifier
  const [verifyInput, setVerifyInput] = useState<string>(initialVerifyQuery);
  const [isVerifyingReceipt, setIsVerifyingReceipt] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState<{
    query: string;
    matches: EnrichedVoteRow[];
    studentName?: string;
    studentId?: string;
    studentClass?: string;
    pollTitle?: string;
    verifiedAt: number;
  } | null>(null);

  // Recount & Void states
  const [isRecounting, setIsRecounting] = useState(false);
  const [confirmVoidVoteKey, setConfirmVoidVoteKey] = useState<string | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);
  const [confirmResetPoll, setConfirmResetPoll] = useState(false);
  const [isResettingPoll, setIsResettingPoll] = useState(false);
  const [copiedReceipt, setCopiedReceipt] = useState<string | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Build lookup maps for enriching any local/cloud vote records
  const pollById = useMemo(() => {
    const map = new Map<number, Poll>();
    polls.forEach((p) => {
      if (p.id != null) map.set(Number(p.id), p);
    });
    return map;
  }, [polls]);

  const candidateById = useMemo(() => {
    const map = new Map<number, Candidate>();
    candidates.forEach((c) => {
      if (c.id != null) map.set(Number(c.id), c);
    });
    return map;
  }, [candidates]);

  const studentByCode = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => {
      if (s.studentId) map.set(String(s.studentId).trim().toUpperCase(), s);
    });
    return map;
  }, [students]);

  // Enriched rows from votes_table + votes
  const enrichedRows = useMemo<EnrichedVoteRow[]>(() => {
    return (votes || [])
      .map((v) => {
        const stu = studentByCode.get(String(v.studentId || '').trim().toUpperCase());
        const cand = candidateById.get(Number(v.candidateId));
        const poll = pollById.get(Number(v.pollId));
        const receiptCode = buildFallbackReceipt(v);
        const studentName =
          v.studentName ||
          v.student_name ||
          (stu ? `${stu.firstName || ''} ${stu.lastName || ''}`.trim() : '') ||
          'Verified Student Voter';
        const studentClass = v.studentClass || v.student_class || stu?.class || 'Unassigned';
        const studentGender = v.studentGender || v.student_gender || stu?.gender || 'Unspecified';
        const candidateName =
          v.candidateName || v.candidate_name || cand?.name || `Candidate #${v.candidateId}`;
        const candidatePhoto = v.candidatePhoto || cand?.photo || undefined;
        const pollTitle = v.pollTitle || v.poll_title || poll?.title || `Election #${v.pollId}`;

        return {
          ...v,
          receiptCode,
          studentName,
          studentClass,
          studentGender,
          candidateName,
          candidatePhoto,
          pollTitle
        };
      })
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  }, [votes, studentByCode, candidateById, pollById]);

  const availablePositions = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => {
      if (pollFilter === 'ALL' || Number(c.pollId) === Number(pollFilter)) {
        if (c.position) set.add(c.position);
      }
    });
    enrichedRows.forEach((r) => {
      if (pollFilter === 'ALL' || Number(r.pollId) === Number(pollFilter)) {
        if (r.position) set.add(r.position);
      }
    });
    return Array.from(set);
  }, [candidates, enrichedRows, pollFilter]);

  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.class) set.add(s.class);
    });
    enrichedRows.forEach((r) => {
      if (r.studentClass) set.add(r.studentClass);
    });
    return Array.from(set).sort();
  }, [students, enrichedRows]);

  const filteredRows = useMemo(() => {
    return enrichedRows.filter((row) => {
      if (pollFilter !== 'ALL' && Number(row.pollId) !== Number(pollFilter)) {
        return false;
      }
      if (positionFilter !== 'ALL' && row.position !== positionFilter) {
        return false;
      }
      if (classFilter !== 'ALL' && row.studentClass !== classFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = [
          row.receiptCode,
          row.studentId,
          row.studentName,
          row.studentClass,
          row.candidateName,
          row.position,
          row.pollTitle
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedRows, pollFilter, positionFilter, classFilter, searchQuery]);

  // Summary & Tally Integrity Metrics
  const stats = useMemo(() => {
    const uniqueVoters = new Set(
      filteredRows.map((r) => String(r.studentId || '').toUpperCase()).filter(Boolean)
    ).size;
    const positionsCount = new Set(filteredRows.map((r) => r.position).filter(Boolean)).size;
    const lastTimestamp = filteredRows.reduce((max, r) => Math.max(max, Number(r.timestamp || 0)), 0);

    // Check if candidate.votesCount sums match actual rows in votes_table
    const targetCandidates =
      pollFilter === 'ALL'
        ? candidates
        : candidates.filter((c) => Number(c.pollId) === Number(pollFilter));
    const targetVotes =
      pollFilter === 'ALL'
        ? enrichedRows
        : enrichedRows.filter((v) => Number(v.pollId) === Number(pollFilter));

    const sumCandidateTallies = targetCandidates.reduce(
      (sum, c) => sum + Number(c.votesCount || 0),
      0
    );
    const actualVoteRowsCount = targetVotes.length;
    const isTallySynced = sumCandidateTallies === actualVoteRowsCount;

    return {
      totalBallots: filteredRows.length,
      uniqueVoters,
      positionsCount,
      lastTimestamp,
      sumCandidateTallies,
      actualVoteRowsCount,
      isTallySynced
    };
  }, [filteredRows, candidates, enrichedRows, pollFilter]);

  const handleCopyReceipt = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedReceipt(code);
    toast.success(`Copied ballot receipt ${code}`);
    setTimeout(() => setCopiedReceipt(null), 2000);
  };

  const handleVerifyReceipt = async (customQuery?: string) => {
    const q = (customQuery !== undefined ? customQuery : verifyInput).trim();
    if (!q) {
      toast.error('Enter a Ballot Receipt Code (EV-...) or Student ID (STU-...) to verify.');
      return;
    }
    setIsVerifyingReceipt(true);
    try {
      const res = await evotingApi.verifyBallotReceipt(q);
      setVerifiedResult({
        query: q,
        matches: res.matches || [],
        studentName: res.studentName,
        studentId: res.studentId,
        studentClass: res.studentClass,
        pollTitle: res.pollTitle,
        verifiedAt: res.verifiedAt || Date.now()
      });
      toast.success(
        `Verified ${res.matchCount || res.matches?.length || 1} ballot record(s) in Supabase votes_table!`
      );
    } catch (err: any) {
      setVerifiedResult(null);
      toast.error(err?.message || `No matching ballot record found in votes_table for "${q}".`);
    } finally {
      setIsVerifyingReceipt(false);
    }
  };

  const handleRecountTallies = async () => {
    setIsRecounting(true);
    try {
      const targetPollId = pollFilter !== 'ALL' ? Number(pollFilter) : 0;
      const res = await evotingApi.recountVotesTable(targetPollId);
      onStatePayloadUpdated(res);
      toast.success(
        `Recounted ${res.totalVotesCounted ?? 0} ballot row(s) from Supabase votes_table and reconciled ${res.recountedCandidates ?? 0} candidate tallies!`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to recount votes_table tallies in Supabase.');
    } finally {
      setIsRecounting(false);
    }
  };

  const handleVoidVote = async (row: EnrichedVoteRow) => {
    setIsVoiding(true);
    try {
      const res = await evotingApi.voidVoteRecord({
        id: row.id,
        pollId: row.pollId,
        studentId: row.studentId,
        position: row.position
      });
      onStatePayloadUpdated(res);
      setConfirmVoidVoteKey(null);
      if (verifiedResult) {
        setVerifiedResult(null);
      }
      toast.success(
        `Voided ballot ${row.receiptCode || ''} (${row.studentId} • ${row.position}) in Supabase votes_table & updated candidate tallies.`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to void ballot in Supabase votes_table.');
    } finally {
      setIsVoiding(false);
    }
  };

  const handleResetPollTestVotes = async () => {
    const targetPollId =
      pollFilter !== 'ALL' ? Number(pollFilter) : selectedPollId || polls[0]?.id || 0;
    if (!targetPollId) {
      toast.error('Please select a specific election poll first.');
      return;
    }
    setIsResettingPoll(true);
    try {
      const res = await evotingApi.resetPollVotes(targetPollId);
      onStatePayloadUpdated(res);
      setConfirmResetPoll(false);
      setVerifiedResult(null);
      toast.success('Cleared all cast ballots for this election in Supabase votes_table & reset candidate tallies to 0.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset poll votes in Supabase.');
    } finally {
      setIsResettingPoll(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredRows.length === 0) {
      toast.error('No ballot rows in votes_table match the current filter to export.');
      return;
    }
    const headers = [
      'Receipt_Code',
      'Vote_ID',
      'Poll_ID',
      'Election_Title',
      'Student_ID',
      'Student_Name',
      'Student_Class',
      'Student_Gender',
      'Position',
      'Candidate_ID',
      'Candidate_Name',
      'Timestamp_ISO',
      'Supabase_Source'
    ];
    const csvLines = [
      headers.join(','),
      ...filteredRows.map((r) =>
        [
          `"${String(r.receiptCode || '').replace(/"/g, '""')}"`,
          r.id ?? '',
          r.pollId,
          `"${String(r.pollTitle || '').replace(/"/g, '""')}"`,
          `"${String(r.studentId || '').replace(/"/g, '""')}"`,
          `"${String(r.studentName || '').replace(/"/g, '""')}"`,
          `"${String(r.studentClass || '').replace(/"/g, '""')}"`,
          `"${String(r.studentGender || '').replace(/"/g, '""')}"`,
          `"${String(r.position || '').replace(/"/g, '""')}"`,
          r.candidateId,
          `"${String(r.candidateName || '').replace(/"/g, '""')}"`,
          `"${new Date(Number(r.timestamp || Date.now())).toISOString()}"`,
          `"${String(r.sourceTable || 'votes_table + votes').replace(/"/g, '""')}"`
        ].join(',')
      )
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `supabase_votes_table_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredRows.length} votes_table record(s) to CSV.`);
  };

  return (
    <div id="evoting-votes-table-printable" className="space-y-6">
      {/* Top Supabase votes_table Connection & Control Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-7 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-52 h-52 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-black uppercase tracking-wider">
                <Database className="w-3.5 h-3.5" />
                SUPABASE: public.votes_table ↔ public.votes
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border ${
                  stats.isTallySynced
                    ? 'bg-indigo-500/20 border-indigo-400/30 text-indigo-200'
                    : 'bg-amber-500/20 border-amber-400/30 text-amber-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {stats.isTallySynced
                  ? '100% Candidate Tally Integrity Match'
                  : `Tally Drift (${stats.sumCandidateTallies} vs ${stats.actualVoteRowsCount} rows)`}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
              Supabase <code className="text-emerald-400 font-mono">votes_table</code> Live Ballot Audit Ledger
            </h2>
            <p className="text-xs md:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Every ballot submitted in the Voting Booth is cryptographically stamped with a receipt code, verified against{' '}
              <code className="text-indigo-300 font-mono">public.students</code>, and synchronized across{' '}
              <code className="text-emerald-300 font-mono">public.votes_table</code> and{' '}
              <code className="text-emerald-300 font-mono">public.votes</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 no-print">
            <button
              type="button"
              onClick={() => onRefreshState(false)}
              disabled={isSyncing}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-black flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
              Sync votes_table
            </button>

            <button
              type="button"
              onClick={handleRecountTallies}
              disabled={isRecounting}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-indigo-950/50 transition-all cursor-pointer disabled:opacity-50"
            >
              <Calculator className={`w-4 h-4 ${isRecounting ? 'animate-spin' : ''}`} />
              {isRecounting ? 'Recounting...' : 'Recount & Sync Tallies'}
            </button>

            {evotingSql && (
              <button
                type="button"
                onClick={() => setShowSqlModal(true)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                votes_table SQL
              </button>
            )}
          </div>
        </div>

        {/* 4 KPI Strip Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-slate-800/90">
          <div className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              <span>Cast Ballots (votes_table)</span>
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-white mt-1.5 font-mono">{stats.totalBallots}</p>
            <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">
              Synced with public.votes ({enrichedRows.length} total)
            </p>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              <span>Unique Verified Voters</span>
              <UserCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-black text-white mt-1.5 font-mono">{stats.uniqueVoters}</p>
            <p className="text-[11px] text-slate-300 font-semibold mt-0.5">
              Out of {students.length} enrolled students
            </p>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              <span>Contested Positions</span>
              <Award className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-black text-white mt-1.5 font-mono">{stats.positionsCount}</p>
            <p className="text-[11px] text-slate-300 font-semibold mt-0.5">
              Distinct offices with recorded votes
            </p>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              <span>Latest Ballot Timestamp</span>
              <Clock className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-base font-black text-white mt-1.5 truncate">
              {stats.lastTimestamp > 0
                ? new Date(stats.lastTimestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })
                : 'No Votes Yet'}
            </p>
            <p className="text-[11px] text-slate-300 font-semibold mt-0.5">
              {stats.lastTimestamp > 0
                ? new Date(stats.lastTimestamp).toLocaleDateString()
                : 'Awaiting first voter ballot'}
            </p>
          </div>
        </div>
      </div>

      {/* Ballot Receipt & Student ID Live Verifier Box */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Instant Supabase Ballot Receipt & Voter Verification
            </span>
            <h3 className="text-base font-black text-slate-900 mt-0.5">
              Verify a Cast Ballot in <code className="text-indigo-600 font-mono">votes_table</code>
            </h3>
            <p className="text-xs text-slate-500">
              Enter a Ballot Receipt Code (e.g. <code className="font-mono font-bold text-slate-700">EV-1-PRE-0001-...</code>) or Student ID (e.g. <code className="font-mono font-bold text-slate-700">STU-051320</code>) to confirm its cryptographic record in Supabase.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleVerifyReceipt();
                  }
                }}
                placeholder="Receipt Code (EV-...) or Student ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => handleVerifyReceipt()}
              disabled={isVerifyingReceipt}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {isVerifyingReceipt ? 'Verifying...' : 'Verify Receipt'}
            </button>
            {verifiedResult && (
              <button
                type="button"
                onClick={() => {
                  setVerifiedResult(null);
                  setVerifyInput('');
                }}
                className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Verification Results Banner */}
        {verifiedResult && (
          <div className="mt-5 p-5 rounded-2xl bg-emerald-50/90 border border-emerald-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 mb-3.5 border-b border-emerald-200/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-sm">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
                      Ballot Verified in Supabase votes_table
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black">
                      {verifiedResult.matches.length} Position(s)
                    </span>
                  </div>
                  <p className="text-xs font-bold text-emerald-800 mt-0.5">
                    Voter: <span className="font-black">{verifiedResult.studentName}</span> ({verifiedResult.studentId} • {verifiedResult.studentClass}) — {verifiedResult.pollTitle}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold text-emerald-700">
                Verified at {new Date(verifiedResult.verifiedAt).toLocaleTimeString()}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {verifiedResult.matches.map((m, idx) => (
                <div
                  key={`${m.receiptCode || idx}`}
                  className="bg-white rounded-xl p-3.5 border border-emerald-200/90 flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">
                      {m.position}
                    </span>
                    <p className="text-sm font-black text-slate-900 truncate mt-0.5">
                      {m.candidateName}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 mt-1">
                      Receipt: <strong className="text-slate-800">{m.receiptCode}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyReceipt(String(m.receiptCode || ''))}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer shrink-0"
                    title="Copy Receipt Code"
                  >
                    {copiedReceipt === m.receiptCode ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter, Search & Export Toolbar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
          {/* Election Poll Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Election Event (poll_id)
            </label>
            <select
              value={pollFilter}
              onChange={(e) => {
                setPollFilter(e.target.value);
                if (e.target.value !== 'ALL') {
                  onSelectPollId(Number(e.target.value));
                }
              }}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Elections ({polls.length})</option>
              {polls.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          {/* Contested Position Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Contested Office (position)
            </label>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Positions ({availablePositions.length})</option>
              {availablePositions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>

          {/* Voter Class Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Voter Class
            </label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Classes ({availableClasses.length})</option>
              {availableClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Filter Ledger Rows
            </label>
            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search voter, ID, candidate, receipt..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Export, Print & Admin Reset Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => triggerPrint()}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-400" />
            Print Ledger
          </button>

          {isAdmin && enrichedRows.length > 0 && (
            <>
              {!confirmResetPoll ? (
                <button
                  type="button"
                  onClick={() => setConfirmResetPoll(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Test Votes
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                  <span className="text-[11px] font-black text-rose-800">Clear poll votes?</span>
                  <button
                    type="button"
                    onClick={handleResetPollTestVotes}
                    disabled={isResettingPoll}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black cursor-pointer"
                  >
                    {isResettingPoll ? 'Clearing...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetPoll(false)}
                    className="px-2 py-1 rounded-lg bg-white text-slate-600 text-[11px] font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main votes_table Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-black text-slate-900">
              Connected Supabase <code className="text-indigo-600 font-mono">votes_table</code> Records ({filteredRows.length})
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            Sync Mode: <strong className="text-emerald-700">{votesTableSyncMode === 'dual_physical_tables' ? 'Dual Physical Tables (votes_table + votes)' : 'Active Bridge (votes_table ↔ public.votes)'}</strong>
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Database className="w-7 h-7" />
            </div>
            <h4 className="text-base font-black text-slate-800">
              No Cast Ballots Found in <code className="font-mono text-indigo-600">votes_table</code>
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {enrichedRows.length === 0
                ? 'As soon as students verify their ID and submit their ballot in the Voting Booth, each cast vote will appear here live from Supabase with its cryptographic receipt code.'
                : 'No ballot records match your current search or position/class filters. Try clearing your filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Ballot Receipt Code</th>
                  <th className="py-3.5 px-4">Voter (Student ID & Class)</th>
                  <th className="py-3.5 px-4">Contested Office</th>
                  <th className="py-3.5 px-4">Selected Candidate</th>
                  <th className="py-3.5 px-4">Election Event</th>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4 text-right no-print">Verify / Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRows.map((row, idx) => {
                  const rowKey = `${row.id || idx}-${row.pollId}-${row.studentId}-${row.position}`;
                  const receipt = String(row.receiptCode || buildFallbackReceipt(row));
                  const isConfirmingVoid = confirmVoidVoteKey === rowKey;

                  return (
                    <tr
                      key={rowKey}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Receipt Code */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-lg text-[11px]">
                            {receipt}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyReceipt(receipt)}
                            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer no-print"
                            title="Copy Receipt Code"
                          >
                            {copiedReceipt === receipt ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Voter Identity */}
                      <td className="py-3.5 px-4">
                        <div className="font-black text-slate-900">{row.studentName}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[11px] font-bold text-slate-600">
                            {row.studentId}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                            {row.studentClass}
                          </span>
                        </div>
                      </td>

                      {/* Position */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-900 font-black text-[11px]">
                          {row.position}
                        </span>
                      </td>

                      {/* Candidate */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {row.candidatePhoto ? (
                            <img
                              src={row.candidatePhoto}
                              alt={row.candidateName}
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-black text-[11px] flex items-center justify-center shrink-0">
                              {String(row.candidateName || 'C').charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-black text-slate-900">{row.candidateName}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              candidate_id: #{row.candidateId}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Poll Title */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-700 max-w-[200px] truncate" title={row.pollTitle}>
                          {row.pollTitle}
                        </div>
                        <div className="text-[10px] font-mono text-emerald-600 font-bold">
                          poll_id: #{row.pollId} • SYNCED
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-800 font-mono">
                          {new Date(Number(row.timestamp || Date.now())).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold">
                          {new Date(Number(row.timestamp || Date.now())).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap no-print">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setVerifyInput(receipt);
                              handleVerifyReceipt(receipt);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-black text-[11px] inline-flex items-center gap-1 cursor-pointer"
                            title="Verify Ballot Receipt in Supabase"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verify
                          </button>

                          {isAdmin && (
                            <>
                              {!isConfirmingVoid ? (
                                <button
                                  type="button"
                                  onClick={() => setConfirmVoidVoteKey(rowKey)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer"
                                  title="Void / Remove Ballot Row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg">
                                  <button
                                    type="button"
                                    onClick={() => handleVoidVote(row)}
                                    disabled={isVoiding}
                                    className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black cursor-pointer"
                                  >
                                    {isVoiding ? '...' : 'Void'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmVoidVoteKey(null)}
                                    className="p-0.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supabase votes_table DDL Modal */}
      {showSqlModal && evotingSql && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-5 h-5 text-emerald-400" />
                <div>
                  <h4 className="text-base font-black">
                    Supabase <code className="text-emerald-400 font-mono">public.votes_table</code> & <code className="text-emerald-400 font-mono">public.votes</code> Schema
                  </h4>
                  <p className="text-xs text-slate-400">
                    Optional SQL script if you wish to create a dedicated physical <code className="font-mono">public.votes_table</code> alongside <code className="font-mono">public.votes</code> in Supabase SQL Editor.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-96 leading-relaxed">
              {evotingSql}
            </pre>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(evotingSql);
                  setCopiedSql(true);
                  toast.success('Copied votes_table SQL schema to clipboard!');
                  setTimeout(() => setCopiedSql(false), 2000);
                }}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-2 cursor-pointer"
              >
                {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedSql ? 'Copied SQL!' : 'Copy SQL Script'}
              </button>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EVotingVotesTable;
