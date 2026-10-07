import React, { useState, useMemo } from 'react';
import { Poll, Candidate, Vote, Student } from '../db/schema';
import { triggerPrint } from '../lib/utils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import {
  Award,
  BarChart3,
  PieChart as PieChartIcon,
  LayoutGrid,
  RefreshCw,
  Download,
  Printer,
  Users,
  Vote as VoteIcon,
  TrendingUp,
  Clock,
  CheckCircle2,
  Inbox,
  Filter
} from 'lucide-react';

interface EVotingAnalyticsProps {
  polls: Poll[];
  candidates: Candidate[];
  votes: Vote[];
  students: Student[];
  selectedPollId: number | null;
  onSelectPoll: (pollId: number) => void;
  onRefresh: () => void;
  isSyncing?: boolean;
  lastSyncedAt?: number | null;
}

const CANDIDATE_PALETTE = [
  '#4f46e5', // Royal Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#8b5cf6', // Violet
  '#0ea5e9', // Sky
  '#14b8a6'  // Teal
];

const GENDER_COLORS: Record<string, string> = {
  Male: '#4f46e5',
  Female: '#10b981',
  Other: '#f59e0b'
};

export default function EVotingAnalytics({
  polls,
  candidates,
  votes,
  students,
  selectedPollId,
  onSelectPoll,
  onRefresh,
  isSyncing = false,
  lastSyncedAt = null
}: EVotingAnalyticsProps) {
  const [selectedPosition, setSelectedPosition] = useState<string>('ALL');
  const [chartMode, setChartMode] = useState<'split' | 'bar' | 'donut'>('split');

  // Resolve active poll
  const activePollId =
    selectedPollId || (polls && polls.length > 0 ? Number(polls[0].id) : null);
  const activePoll = useMemo(
    () => polls.find((p) => Number(p.id) === Number(activePollId)) || null,
    [polls, activePollId]
  );

  // Filter candidates & votes for the selected election
  const pollCandidates = useMemo(
    () => candidates.filter((c) => Number(c.pollId) === Number(activePollId)),
    [candidates, activePollId]
  );

  const pollVotes = useMemo(
    () => votes.filter((v) => Number(v.pollId) === Number(activePollId)),
    [votes, activePollId]
  );

  // Map studentId (uppercase) -> Student record from Supabase
  const studentLookup = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of students) {
      if (s?.studentId) {
        map.set(String(s.studentId).trim().toUpperCase(), s);
      }
    }
    return map;
  }, [students]);

  // Distinct student IDs who cast a ballot in this election
  const uniqueVoterIds = useMemo(() => {
    const set = new Set<string>();
    for (const v of pollVotes) {
      if (v?.studentId) {
        set.add(String(v.studentId).trim().toUpperCase());
      }
    }
    return Array.from(set);
  }, [pollVotes]);

  const totalUniqueBallots = uniqueVoterIds.length;
  const totalEnrolledStudents = students.length;
  const turnoutPercentage =
    totalEnrolledStudents > 0
      ? Math.min(100, Math.round((totalUniqueBallots / totalEnrolledStudents) * 1000) / 10)
      : 0;

  // Group candidates by position with computed vote counts, percentages, ranks, and lead margins
  const positionsSummary = useMemo(() => {
    const grouped: Record<string, Candidate[]> = {};
    for (const cand of pollCandidates) {
      const pos = cand.position || 'General';
      if (!grouped[pos]) grouped[pos] = [];
      grouped[pos].push(cand);
    }

    // Also count actual vote rows per candidate as fallback verification
    const voteRowCountByCand = new Map<number, number>();
    for (const v of pollVotes) {
      const cid = Number(v.candidateId);
      if (cid) {
        voteRowCountByCand.set(cid, (voteRowCountByCand.get(cid) || 0) + 1);
      }
    }

    return Object.entries(grouped).map(([position, list]) => {
      const enriched = list
        .map((c, idx) => {
          const cid = Number(c.id || 0);
          const effectiveVotes = Math.max(
            Number(c.votesCount || 0),
            voteRowCountByCand.get(cid) || 0
          );
          return {
            ...c,
            effectiveVotes,
            color: CANDIDATE_PALETTE[idx % CANDIDATE_PALETTE.length]
          };
        })
        .sort((a, b) => b.effectiveVotes - a.effectiveVotes);

      const totalPositionVotes = enriched.reduce((sum, c) => sum + c.effectiveVotes, 0);

      const candidatesWithShare = enriched.map((c, index) => {
        const share =
          totalPositionVotes > 0
            ? Math.round((c.effectiveVotes / totalPositionVotes) * 1000) / 10
            : 0;
        return {
          ...c,
          rank: index + 1,
          share,
          // For donut chart rendering when 0 votes exist, provide a subtle placeholder weight
          donutValue: totalPositionVotes > 0 ? c.effectiveVotes : 1
        };
      });

      const leader = candidatesWithShare[0] || null;
      const runnerUp = candidatesWithShare[1] || null;
      const isTie =
        totalPositionVotes > 0 &&
        leader &&
        runnerUp &&
        leader.effectiveVotes === runnerUp.effectiveVotes;
      const leadMargin =
        leader && runnerUp ? leader.effectiveVotes - runnerUp.effectiveVotes : leader?.effectiveVotes || 0;

      return {
        position,
        totalPositionVotes,
        candidates: candidatesWithShare,
        leader,
        runnerUp,
        isTie,
        leadMargin
      };
    });
  }, [pollCandidates, pollVotes]);

  const allPositionsList = useMemo(
    () => positionsSummary.map((p) => p.position),
    [positionsSummary]
  );

  // Reset position filter if selected position doesn't exist in newly selected poll
  const activeFilteredPositions = useMemo(() => {
    if (selectedPosition === 'ALL' || !allPositionsList.includes(selectedPosition)) {
      return positionsSummary;
    }
    return positionsSummary.filter((p) => p.position === selectedPosition);
  }, [positionsSummary, selectedPosition, allPositionsList]);

  // Overall top vote-getter across all positions
  const topOverallCandidate = useMemo(() => {
    const all = positionsSummary.flatMap((p) => p.candidates);
    if (all.length === 0) return null;
    return [...all].sort((a, b) => b.effectiveVotes - a.effectiveVotes)[0];
  }, [positionsSummary]);

  // Latest ballot timestamp
  const latestVoteTimestamp = useMemo(() => {
    if (pollVotes.length === 0) return null;
    return Math.max(...pollVotes.map((v) => Number(v.timestamp || 0)));
  }, [pollVotes]);

  // 1. Voting Activity Timeline Data (Recharts AreaChart)
  const votingTimelineData = useMemo(() => {
    // Deduplicate by studentId so we track distinct student ballot submissions by timestamp
    const earliestByStudent = new Map<string, number>();
    for (const v of pollVotes) {
      const sid = String(v.studentId || '').trim().toUpperCase();
      const ts = Number(v.timestamp || Date.now());
      if (!sid) continue;
      if (!earliestByStudent.has(sid) || ts < earliestByStudent.get(sid)!) {
        earliestByStudent.set(sid, ts);
      }
    }

    const timestamps = Array.from(earliestByStudent.values()).sort((a, b) => a - b);
    if (timestamps.length === 0) {
      // Provide a clean baseline timeline before first ballot is cast
      const baseHours = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30'];
      return baseHours.map((timeLabel) => ({
        time: timeLabel,
        newBallots: 0,
        cumulativeBallots: 0
      }));
    }

    const bucketMap = new Map<string, number>();
    for (const ts of timestamps) {
      const d = new Date(ts);
      const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      bucketMap.set(label, (bucketMap.get(label) || 0) + 1);
    }

    let cumulative = 0;
    const points = Array.from(bucketMap.entries()).map(([time, count]) => {
      cumulative += count;
      return {
        time,
        newBallots: count,
        cumulativeBallots: cumulative
      };
    });

    if (points.length === 1) {
      return [
        { time: 'Start', newBallots: 0, cumulativeBallots: 0 },
        ...points
      ];
    }
    return points;
  }, [pollVotes]);

  // 2. Class-by-Class Turnout Data (Recharts BarChart)
  const classTurnoutData = useMemo(() => {
    const classStats = new Map<
      string,
      { className: string; enrolled: number; voted: number }
    >();

    for (const s of students) {
      const cls = String(s.class || 'Unassigned').trim() || 'Unassigned';
      if (!classStats.has(cls)) {
        classStats.set(cls, { className: cls, enrolled: 0, voted: 0 });
      }
      classStats.get(cls)!.enrolled += 1;
    }

    for (const voterId of uniqueVoterIds) {
      const matchedStu = studentLookup.get(voterId);
      const cls = String(matchedStu?.class || 'Verified Voter').trim();
      if (!classStats.has(cls)) {
        classStats.set(cls, { className: cls, enrolled: 1, voted: 1 });
      } else {
        classStats.get(cls)!.voted += 1;
      }
    }

    return Array.from(classStats.values())
      .map((item) => ({
        ...item,
        remaining: Math.max(0, item.enrolled - item.voted),
        turnoutRate:
          item.enrolled > 0 ? Math.min(100, Math.round((item.voted / item.enrolled) * 100)) : 0
      }))
      .sort((a, b) => b.voted - a.voted || b.enrolled - a.enrolled);
  }, [students, uniqueVoterIds, studentLookup]);

  // 3. Gender Turnout Distribution Data (Recharts PieChart + Breakdown)
  const genderTurnoutData = useMemo(() => {
    const counts: Record<'Male' | 'Female', { enrolled: number; voted: number }> = {
      Male: { enrolled: 0, voted: 0 },
      Female: { enrolled: 0, voted: 0 }
    };

    for (const s of students) {
      const g = String(s.gender || '').toLowerCase() === 'female' ? 'Female' : 'Male';
      counts[g].enrolled += 1;
    }

    for (const voterId of uniqueVoterIds) {
      const matched = studentLookup.get(voterId);
      const g = String(matched?.gender || '').toLowerCase() === 'female' ? 'Female' : 'Male';
      counts[g].voted += 1;
    }

    const totalVoted = counts.Male.voted + counts.Female.voted;

    return (['Male', 'Female'] as const).map((gender) => ({
      name: gender,
      enrolled: counts[gender].enrolled,
      voted: counts[gender].voted,
      donutValue: totalVoted > 0 ? counts[gender].voted : Math.max(1, counts[gender].enrolled),
      shareOfVoters:
        totalVoted > 0 ? Math.round((counts[gender].voted / totalVoted) * 100) : 0,
      turnoutRate:
        counts[gender].enrolled > 0
          ? Math.min(100, Math.round((counts[gender].voted / counts[gender].enrolled) * 100))
          : 0,
      color: GENDER_COLORS[gender]
    }));
  }, [students, uniqueVoterIds, studentLookup]);

  // Export CSV handler
  const handleExportCsv = () => {
    if (!activePoll) return;
    const rows: string[][] = [
      [
        'Election Title',
        'Election Status',
        'Position',
        'Rank',
        'Candidate Name',
        'Class',
        'Votes Cast',
        'Vote Share (%)'
      ]
    ];

    for (const posGroup of positionsSummary) {
      for (const cand of posGroup.candidates) {
        rows.push([
          `"${String(activePoll.title || '').replace(/"/g, '""')}"`,
          activePoll.status.toUpperCase(),
          `"${String(posGroup.position || '').replace(/"/g, '""')}"`,
          `#${cand.rank}`,
          `"${String(cand.name || '').replace(/"/g, '""')}"`,
          `"${String(cand.class || '').replace(/"/g, '""')}"`,
          String(cand.effectiveVotes),
          `${cand.share}%`
        ]);
      }
    }

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evoting-standings-${String(activePoll.title || 'election')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ==================== 1. INTERACTIVE VISUALIZATION TOOLBAR ==================== */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span className="text-indigo-600 uppercase tracking-wider font-black">
                Recharts Real-Time Election Telemetry
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {isSyncing
                  ? 'Syncing live tallies...'
                  : lastSyncedAt
                  ? `Updated ${new Date(lastSyncedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}`
                  : 'Supabase Live Feed'}
              </span>
            </div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              Election Standings &amp; Vote Distribution Analytics
            </h3>
          </div>

          {/* Poll Selector + Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={activePollId || ''}
              onChange={(e) => {
                onSelectPoll(Number(e.target.value));
                setSelectedPosition('ALL');
              }}
              className="w-full sm:w-72 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 outline-none cursor-pointer"
            >
              <option value="" disabled>
                Select election event...
              </option>
              {polls.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.status.toUpperCase()})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isSyncing}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`}
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!activePoll || pollCandidates.length === 0}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => triggerPrint()}
              disabled={!activePoll}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Results</span>
            </button>
          </div>
        </div>

        {/* Position Filter & Chart Mode Switcher */}
        {activePoll && allPositionsList.length > 0 && (
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
            {/* Position Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3" /> Position:
              </span>
              <button
                type="button"
                onClick={() => setSelectedPosition('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                  selectedPosition === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                All Positions ({allPositionsList.length})
              </button>
              {allPositionsList.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setSelectedPosition(pos)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    selectedPosition === pos
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* Chart View Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setChartMode('split')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  chartMode === 'split'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-indigo-600" />
                <span>Split View</span>
              </button>
              <button
                type="button"
                onClick={() => setChartMode('bar')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  chartMode === 'bar'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Bar Chart</span>
              </button>
              <button
                type="button"
                onClick={() => setChartMode('donut')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  chartMode === 'donut'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Donut Share</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {!activePoll ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center flex flex-col items-center justify-center space-y-3 shadow-sm min-h-[280px]">
          <Inbox className="w-10 h-10 text-slate-300" />
          <p className="text-xs text-slate-500 font-semibold">
            No election selected. Create or select an election event to view real-time Recharts
            analytics.
          </p>
        </div>
      ) : (
        <>
          {/* ==================== 2. EXECUTIVE KPI TELEMETRY STRIP ==================== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Total Ballots Cast */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span className="uppercase tracking-wider text-[10px] font-black text-slate-400">
                  Distinct Ballots Cast
                </span>
                <VoteIcon className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-black text-slate-900 tabular-nums">
                  {totalUniqueBallots}
                </span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  · {pollVotes.length} position votes
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Verified unique student voters in Supabase
              </p>
            </div>

            {/* KPI 2: Campus Voter Turnout Rate */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span className="uppercase tracking-wider text-[10px] font-black text-slate-400">
                  Student Turnout Rate
                </span>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-mono font-black text-slate-900 tabular-nums">
                  {turnoutPercentage}%
                </span>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {totalUniqueBallots} / {totalEnrolledStudents} students
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, turnoutPercentage)}%` }}
                />
              </div>
            </div>

            {/* KPI 3: Contested Positions & Nominees */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span className="uppercase tracking-wider text-[10px] font-black text-slate-400">
                  Contested Offices
                </span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-black text-slate-900 tabular-nums">
                  {positionsSummary.length}
                </span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  · {pollCandidates.length} nominees on slate
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {allPositionsList.join(' · ') || 'No offices configured'}
              </p>
            </div>

            {/* KPI 4: Leading Candidate / Latest Activity */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span className="uppercase tracking-wider text-[10px] font-black text-slate-400">
                  Highest Vote-Getter
                </span>
                <TrendingUp className="w-4 h-4 text-indigo-600" />
              </div>
              {topOverallCandidate && topOverallCandidate.effectiveVotes > 0 ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-black text-slate-900 truncate">
                      {topOverallCandidate.name}
                    </span>
                    <span className="text-sm font-mono font-black text-indigo-600 tabular-nums shrink-0">
                      {topOverallCandidate.effectiveVotes} vo ({topOverallCandidate.share}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono truncate">
                    {topOverallCandidate.position} ·{' '}
                    {latestVoteTimestamp
                      ? `Last vote ${new Date(latestVoteTimestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}`
                      : 'Active'}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-sm font-black text-slate-700">Awaiting First Ballot</div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Polls are ready — standings update live as students vote
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ==================== 3. POSITION-BY-POSITION CANDIDATE STANDINGS & VOTE DISTRIBUTION ==================== */}
          {activeFilteredPositions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center flex flex-col items-center justify-center space-y-2 shadow-sm">
              <Inbox className="w-8 h-8 text-slate-300" />
              <p className="text-xs text-slate-500 font-semibold">
                No candidates registered for this election yet. Use the Admin Console tab to inject
                nominees.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {activeFilteredPositions.map((posData) => {
                const barChartData = posData.candidates.map((c) => ({
                  name: c.name,
                  shortName:
                    c.name.length > 16 ? `${c.name.slice(0, 15).trim()}…` : c.name,
                  votes: c.effectiveVotes,
                  share: c.share,
                  class: c.class,
                  color: c.color
                }));

                const donutChartData = posData.candidates.map((c) => ({
                  name: c.name,
                  votes: c.effectiveVotes,
                  donutValue: c.donutValue,
                  share: c.share,
                  color: c.color
                }));

                return (
                  <div
                    key={posData.position}
                    className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6"
                  >
                    {/* Position Header & Frontrunner Summary */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                          <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider font-mono">
                            {posData.position}
                          </h4>
                          <span className="text-xs text-slate-400 font-mono tabular-nums">
                            · {posData.candidates.length} Candidates · {posData.totalPositionVotes}{' '}
                            Total Votes
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          {posData.totalPositionVotes === 0 ? (
                            'No ballots cast for this office yet — displaying registered candidate slate.'
                          ) : posData.isTie ? (
                            <span className="text-amber-700 font-bold">
                              Tie for 1st place at {posData.leader?.effectiveVotes} votes (
                              {posData.leader?.share}%)
                            </span>
                          ) : (
                            <span>
                              Leading:{' '}
                              <strong className="text-slate-900 font-extrabold">
                                {posData.leader?.name}
                              </strong>{' '}
                              with{' '}
                              <span className="font-mono font-bold text-indigo-600 tabular-nums">
                                {posData.leader?.effectiveVotes} votes ({posData.leader?.share}%)
                              </span>
                              {posData.runnerUp && (
                                <span className="text-emerald-600 font-mono font-bold tabular-nums">
                                  {' '}
                                  · +{posData.leadMargin} vote lead
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                      </div>

                      {posData.leader && posData.totalPositionVotes > 0 && !posData.isTie && (
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50/70 border border-emerald-200/70 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Frontrunner: {posData.leader.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Charts Grid (Responsive to chartMode: split | bar | donut) */}
                    <div
                      className={`grid grid-cols-1 ${
                        chartMode === 'split' ? 'lg:grid-cols-12' : 'lg:grid-cols-1'
                      } gap-6 items-center`}
                    >
                      {/* A. Recharts Candidate Vote BarChart */}
                      {(chartMode === 'split' || chartMode === 'bar') && (
                        <div
                          className={`${
                            chartMode === 'split' ? 'lg:col-span-7' : 'w-full'
                          } space-y-2`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                            <span>Candidate Vote Tallies</span>
                            <span className="font-mono tabular-nums">
                              Max:{' '}
                              {Math.max(...barChartData.map((d) => d.votes), 0)} votes
                            </span>
                          </div>
                          <div className="h-64 w-full bg-slate-50/50 border border-slate-100 rounded-2xl p-3">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={barChartData}
                                margin={{ top: 12, right: 16, left: -16, bottom: 8 }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  vertical={false}
                                  stroke="#e2e8f0"
                                />
                                <XAxis
                                  dataKey="shortName"
                                  stroke="#64748b"
                                  fontSize={11}
                                  tickLine={false}
                                  axisLine={false}
                                  fontWeight={700}
                                />
                                <YAxis
                                  stroke="#64748b"
                                  fontSize={11}
                                  tickLine={false}
                                  axisLine={false}
                                  allowDecimals={false}
                                />
                                <Tooltip
                                  cursor={{ fill: 'rgba(79, 70, 229, 0.06)' }}
                                  contentStyle={{
                                    backgroundColor: '#0f172a',
                                    borderRadius: '12px',
                                    border: '1px solid #1e293b',
                                    color: '#fff',
                                    fontSize: '12px'
                                  }}
                                  formatter={(value: any, _name: any, item: any) => [
                                    `${value} votes (${item?.payload?.share ?? 0}%)`,
                                    'Standing'
                                  ]}
                                  labelFormatter={(_label, payload) =>
                                    payload?.[0]?.payload?.name || _label
                                  }
                                />
                                <Bar
                                  dataKey="votes"
                                  radius={[8, 8, 0, 0]}
                                  maxBarSize={54}
                                >
                                  {barChartData.map((entry, index) => (
                                    <Cell key={`bar-cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* B. Recharts Vote-Share Donut Chart + Candidate Breakdown */}
                      {(chartMode === 'split' || chartMode === 'donut') && (
                        <div
                          className={`${
                            chartMode === 'split' ? 'lg:col-span-5' : 'w-full'
                          } grid grid-cols-1 ${
                            chartMode === 'donut' ? 'md:grid-cols-2' : ''
                          } gap-4 items-center bg-slate-50/50 border border-slate-100 rounded-2xl p-4`}
                        >
                          {/* Donut PieChart */}
                          <div className="relative h-52 w-full flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={donutChartData}
                                  dataKey="donutValue"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={52}
                                  outerRadius={78}
                                  paddingAngle={3}
                                  strokeWidth={2}
                                  stroke="#ffffff"
                                >
                                  {donutChartData.map((entry, idx) => (
                                    <Cell
                                      key={`donut-cell-${idx}`}
                                      fill={
                                        posData.totalPositionVotes > 0
                                          ? entry.color
                                          : '#cbd5e1'
                                      }
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#0f172a',
                                    borderRadius: '10px',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '11px'
                                  }}
                                  formatter={(_val: any, _name: any, item: any) => [
                                    `${item?.payload?.votes ?? 0} votes (${
                                      item?.payload?.share ?? 0
                                    }%)`,
                                    item?.payload?.name || 'Candidate'
                                  ]}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            {/* Center Donut Total Label */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                              <span className="text-lg font-mono font-black text-slate-900 tabular-nums leading-none">
                                {posData.totalPositionVotes}
                              </span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">
                                Votes Cast
                              </span>
                            </div>
                          </div>

                          {/* Detailed Candidate Share & Progress Rows */}
                          <div className="space-y-2.5">
                            {posData.candidates.map((cand) => (
                              <div
                                key={cand.id}
                                className="bg-white p-2.5 rounded-xl border border-slate-200/70 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: cand.color }}
                                    />
                                    {cand.photo && (
                                      <img
                                        src={cand.photo}
                                        alt={cand.name}
                                        className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                                        referrerPolicy="no-referrer"
                                      />
                                    )}
                                    <span className="text-xs font-extrabold text-slate-800 truncate">
                                      {cand.name}
                                    </span>
                                  </div>
                                  <div className="text-xs font-mono font-black text-slate-900 tabular-nums shrink-0">
                                    {cand.effectiveVotes}{' '}
                                    <span className="text-slate-400 font-normal">
                                      ({cand.share}%)
                                    </span>
                                  </div>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.max(cand.share, cand.effectiveVotes > 0 ? 4 : 0)}%`,
                                      backgroundColor: cand.color
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ==================== 4. VOTER PARTICIPATION & TIMELINE ANALYTICS ROW ==================== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 4A. Ballot Casting Activity Timeline (Recharts AreaChart) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-600" /> Voting Timeline
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Cumulative &amp; interval ballots cast over time
                  </p>
                </div>
                <span className="text-xs font-mono font-black text-indigo-600 tabular-nums">
                  {totalUniqueBallots} total
                </span>
              </div>

              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={votingTimelineData}
                    margin={{ top: 10, right: 10, left: -22, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="evotingTimelineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="time"
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderRadius: '10px',
                        border: 'none',
                        color: '#fff',
                        fontSize: '11px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulativeBallots"
                      name="Cumulative Ballots"
                      stroke="#4f46e5"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#evotingTimelineGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="newBallots"
                      name="Interval Ballots"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={0}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 4B. Class-by-Class Voter Turnout (Recharts BarChart) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-emerald-600" /> Class Turnout Breakdown
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Voted vs. enrolled students per class in Supabase
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500 tabular-nums">
                  {classTurnoutData.length} classes
                </span>
              </div>

              {classTurnoutData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-xs text-slate-400">
                  No student classes registered yet.
                </div>
              ) : (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={classTurnoutData}
                      margin={{ top: 10, right: 10, left: -22, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="className"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        fontWeight={700}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '10px',
                          border: 'none',
                          color: '#fff',
                          fontSize: '11px'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Bar
                        dataKey="voted"
                        name="Voted"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="enrolled"
                        name="Enrolled"
                        fill="#cbd5e1"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 4C. Gender Turnout Breakdown (Recharts Donut + Stats) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" /> Gender Turnout Split
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Voter participation by student gender
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500 tabular-nums">
                  {totalEnrolledStudents} enrolled
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={genderTurnoutData}
                        dataKey="donutValue"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={58}
                        paddingAngle={4}
                      >
                        {genderTurnoutData.map((entry, idx) => (
                          <Cell key={`gender-cell-${idx}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '10px',
                          border: 'none',
                          color: '#fff',
                          fontSize: '11px'
                        }}
                        formatter={(_val: any, _name: any, item: any) => [
                          `${item?.payload?.voted ?? 0} voted / ${
                            item?.payload?.enrolled ?? 0
                          } enrolled (${item?.payload?.turnoutRate ?? 0}%)`,
                          item?.payload?.name
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  {genderTurnoutData.map((g) => (
                    <div
                      key={g.name}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: g.color }}
                          />
                          {g.name}
                        </span>
                        <span className="font-mono font-black text-slate-900 tabular-nums">
                          {g.turnoutRate}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${g.turnoutRate}%`,
                            backgroundColor: g.color
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono tabular-nums">
                        {g.voted} voted of {g.enrolled} enrolled ({g.shareOfVoters}% share)
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ==================== 5. OFFICIAL CERTIFIED ELECTION STANDINGS TABLE (PRINT-READY) ==================== */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider font-mono">
                  Official Certified Standings Summary Sheet
                </h4>
                <p className="text-[11px] text-slate-400 font-medium">
                  {activePoll.title} · Status: {activePoll.status.toUpperCase()} · Turnout:{' '}
                  {totalUniqueBallots}/{totalEnrolledStudents} ({turnoutPercentage}%)
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                Generated {new Date().toLocaleDateString()}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-3">Position Office</th>
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Candidate Name</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3 text-right">Votes Cast</th>
                    <th className="py-2.5 px-3 text-right">Vote Share</th>
                    <th className="py-2.5 px-3 text-right">Standing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {positionsSummary.flatMap((posGroup) =>
                    posGroup.candidates.map((cand) => {
                      const isWinner =
                        cand.rank === 1 &&
                        posGroup.totalPositionVotes > 0 &&
                        !posGroup.isTie;
                      return (
                        <tr key={cand.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                            {posGroup.position}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-slate-900 tabular-nums">
                            #{cand.rank}
                          </td>
                          <td className="py-2.5 px-3 font-extrabold text-slate-900">
                            {cand.name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {cand.class}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 tabular-nums">
                            {cand.effectiveVotes}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 tabular-nums">
                            {cand.share}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            {posGroup.totalPositionVotes === 0 ? (
                              <span className="text-slate-400">Pending Votes</span>
                            ) : isWinner ? (
                              <span className="text-emerald-600">Leading / Winner</span>
                            ) : posGroup.isTie && cand.rank <= 2 ? (
                              <span className="text-amber-600">Tied</span>
                            ) : (
                              <span className="text-slate-500">Contender</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
