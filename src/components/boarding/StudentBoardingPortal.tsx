import React from 'react';
import {
  Bed,
  Home,
  Users,
  FileText,
  HeartPulse,
  Plus,
  Phone,
  Printer,
  Calendar,
  ShieldCheck,
  DoorOpen,
  Building,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import {
  Student,
  BoardingHouse,
  BoardingRoom,
  BoardingAllocation,
  BoardingExeat,
  BoardingMedicalLog
} from '../../db/schema';

interface StudentBoardingPortalProps {
  student: Student | null;
  allocation?: BoardingAllocation | null;
  house?: BoardingHouse | null;
  room?: BoardingRoom | null;
  roommates: BoardingAllocation[];
  exeats: BoardingExeat[];
  medicalLogs: BoardingMedicalLog[];
  onApplyExeat: () => void;
  onPrintExeat: (exeat: BoardingExeat) => void;
}

export function StudentBoardingPortal({
  student,
  allocation,
  house,
  room,
  roommates,
  exeats,
  medicalLogs,
  onApplyExeat,
  onPrintExeat
}: StudentBoardingPortalProps) {
  const isBoarder = Boolean(allocation || student?.residentialStatus === 'Boarder');

  const pendingExeatCount = exeats.filter(
    e => e.status === 'pending' || e.status === 'pending_parent'
  ).length;

  const activeApprovedExeat = exeats.find(
    e => e.status === 'approved' || e.status === 'checked_out'
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Student Portal Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#1c4a59]/10 text-[#1c4a59] dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Bed className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                My Boarding & Residence Portal
              </h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                isBoarder
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {isBoarder ? 'Resident Boarder' : 'Day Student'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {student ? `${student.firstName} ${student.lastName} · ID: ${student.studentId} · Class: ${student.class}` : 'Student Resident Overview'}
            </p>
          </div>
        </div>

        <button
          onClick={onApplyExeat}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1c4a59] hover:bg-[#153843] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Apply for Exeat Leave Pass</span>
        </button>
      </div>

      {/* Active Leave Notice if currently approved or checked out */}
      {activeApprovedExeat && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Active Gate Pass: {activeApprovedExeat.passCode} ({activeApprovedExeat.exeatType})
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                Destination: {activeApprovedExeat.destination} · Expected Return: <span className="font-mono font-semibold">{activeApprovedExeat.expectedReturnDate}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => onPrintExeat(activeApprovedExeat)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>View Gate Slip</span>
          </button>
        </div>
      )}

      {/* Residence & Room Allocation Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <Home className="w-4 h-4 text-[#1c4a59] dark:text-cyan-400" />
            <span>Dormitory Accommodation</span>
          </div>
          {allocation && (
            <span className="text-xs text-slate-500 font-mono">
              Academic Term: {allocation.academicYear} · {allocation.term}
            </span>
          )}
        </div>

        {isBoarder && allocation ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">House / Hall</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white mt-1 block">
                  {allocation.houseName || house?.name || 'Assigned House'}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">{house?.gender || 'Mixed'} Dormitory</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Room & Floor</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white mt-1 block">
                  Room {allocation.roomNumber}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">{room?.floor || 'Ground Floor'}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Bed Space</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white mt-1 block font-mono">
                  {allocation.bedNumber}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">{allocation.bedType || 'Single Bunk'}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Housemaster</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white mt-1 block truncate">
                  {house?.housemasterName || 'Resident Housemaster'}
                </span>
                {house?.housemasterPhone ? (
                  <a
                    href={`tel:${house.housemasterPhone}`}
                    className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 inline-flex items-center gap-1 font-mono hover:underline"
                  >
                    <Phone className="w-2.5 h-2.5" />
                    <span>{house.housemasterPhone}</span>
                  </a>
                ) : (
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Staff in Residence</span>
                )}
              </div>
            </div>

            {/* Roommates Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>Room {allocation.roomNumber} Residents & Roommates ({roommates.length + 1})</span>
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[#1c4a59]/5 border border-[#1c4a59]/20 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1c4a59] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {student?.firstName?.charAt(0) || 'U'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">
                      {student?.firstName} {student?.lastName} (You)
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {allocation.bedNumber} · {student?.class}
                    </span>
                  </div>
                </div>

                {roommates.map((mate) => (
                  <div
                    key={mate.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">
                      {mate.studentName?.charAt(0) || 'R'}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate block">
                        {mate.studentName}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        {mate.bedNumber} · {mate.className}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center">
            <Building className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Day Scholar Profile</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              You are currently registered as a Day Student and not allocated to a boarding house. You may still apply for Day Exeat passes if attending supervised school trips or events.
            </p>
          </div>
        )}
      </div>

      {/* Exeat Passes Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>My Exeat Leave Passes ({exeats.length})</span>
          </div>
          {pendingExeatCount > 0 && (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 rounded-full">
              {pendingExeatCount} under review
            </span>
          )}
        </div>

        {exeats.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No exeat leave requests recorded.</p>
            <button
              onClick={onApplyExeat}
              className="mt-3 text-xs font-semibold text-[#1c4a59] hover:underline"
            >
              Request your first exeat pass
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Pass Ref</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Destination & Reason</th>
                  <th className="py-2.5 px-3">Departure & Return</th>
                  <th className="py-2.5 px-3">Approval Stage</th>
                  <th className="py-2.5 px-3 text-right">Gate Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {exeats.map((ex) => {
                  const isApproved = ex.status === 'approved' || ex.status === 'checked_out' || ex.status === 'checked_in';
                  const isPendingParent = ex.status === 'pending_parent';
                  const isPendingStaff = ex.status === 'pending';
                  const isRejected = ex.status === 'rejected';

                  return (
                    <tr key={ex.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-[#1c4a59] dark:text-cyan-400 whitespace-nowrap">
                        {ex.passCode}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {ex.exeatType}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900 dark:text-white">{ex.destination}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{ex.reason}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                        <div className="text-slate-800 dark:text-slate-200">Out: {ex.departureDate}</div>
                        <div className="text-slate-500">In: {ex.expectedReturnDate}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isPendingParent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3 h-3" />
                            <span>Awaiting Parent Consent</span>
                          </span>
                        ) : isPendingStaff ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            <Clock className="w-3 h-3" />
                            <span>Housemaster Review</span>
                          </span>
                        ) : isApproved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{ex.status === 'checked_out' ? 'Off Campus (Checked Out)' : ex.status === 'checked_in' ? 'Completed & Returned' : 'Approved Gate Pass'}</span>
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                            <XCircle className="w-3 h-3" />
                            <span>Declined</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {ex.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {isApproved ? (
                          <button
                            onClick={() => onPrintExeat(ex)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Print Slip</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Slip on approval</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Medical & Infirmary Records */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <HeartPulse className="w-4 h-4 text-rose-500" />
            <span>Clinic & Infirmary History ({medicalLogs.length})</span>
          </div>
        </div>

        {medicalLogs.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <HeartPulse className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No sick bay or clinic visits on record. You are in good health!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {medicalLogs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {log.complaint}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      log.status === 'admitted_to_sickbay'
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    }`}>
                      {log.status === 'admitted_to_sickbay' ? 'Admitted to Sick Bay' : 'Treated & Discharged'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Treatment Given: {log.treatmentGiven} · Attending Staff: {log.attendingStaff}
                  </div>
                </div>
                <div className="font-mono text-[11px] text-slate-500 shrink-0">
                  {log.visitDate}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
