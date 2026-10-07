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
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Check,
  X,
  Building
} from 'lucide-react';
import {
  Student,
  BoardingHouse,
  BoardingRoom,
  BoardingAllocation,
  BoardingExeat,
  BoardingMedicalLog
} from '../../db/schema';

interface ParentBoardingPortalProps {
  wards: Student[];
  selectedWard: Student | null;
  onSelectWard: (studentId: string) => void;
  allocation?: BoardingAllocation | null;
  house?: BoardingHouse | null;
  room?: BoardingRoom | null;
  exeats: BoardingExeat[];
  medicalLogs: BoardingMedicalLog[];
  pendingExeats: BoardingExeat[];
  onAuthorize: (exeatId: string, approved: boolean, notes?: string) => Promise<void>;
  onApplyExeat: () => void;
  onPrintExeat: (exeat: BoardingExeat) => void;
}

export function ParentBoardingPortal({
  wards,
  selectedWard,
  onSelectWard,
  allocation,
  house,
  room,
  exeats,
  medicalLogs,
  pendingExeats,
  onAuthorize,
  onApplyExeat,
  onPrintExeat
}: ParentBoardingPortalProps) {
  const isBoarder = Boolean(allocation || selectedWard?.residentialStatus === 'Boarder');

  const currentlyAdmittedMedical = medicalLogs.find(
    m => m.status === 'admitted_to_sickbay'
  );

  const activeOffCampusExeat = exeats.find(
    e => e.status === 'checked_out'
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      {/* Parent Portal Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#807654]/10 text-[#807654] dark:text-amber-400 flex items-center justify-center shrink-0">
            <Bed className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Ward Boarding & Exeat Oversight
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Monitor your child's dormitory placement, review health clinic logs, and digitally authorize leave passes
            </p>
          </div>
        </div>

        <button
          onClick={onApplyExeat}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1c4a59] hover:bg-[#153843] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Request Leave on Behalf of Ward</span>
        </button>
      </div>

      {/* Ward Selection Tabs (if parent has multiple students) */}
      {wards.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Select Ward:</span>
          {wards.map((ward) => {
            const isSelected = selectedWard?.studentId === ward.studentId;
            return (
              <button
                key={ward.studentId}
                onClick={() => onSelectWard(ward.studentId)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-[#1c4a59] border-[#1c4a59] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>{ward.firstName} {ward.lastName}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}>
                  {ward.class}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ACTION REQUIRED: Pending Parent Authorization Banner */}
      {pendingExeats.length > 0 && (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Action Required: Pending Exeat Pass Authorization ({pendingExeats.length})</span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Your child has submitted a campus leave application that requires parental consent before the Housemaster can issue an official security pass.
          </p>

          <div className="space-y-3 pt-1">
            {pendingExeats.map((ex) => (
              <div
                key={ex.id}
                className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-amber-200 dark:border-amber-900/60 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {ex.exeatType}
                    </span>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      {ex.passCode}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-white">Destination:</span> {ex.destination}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-white">Reason:</span> "{ex.reason}"
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 pt-1 flex items-center gap-3">
                    <span>Departure: <strong>{ex.departureDate}</strong></span>
                    <span>Expected Return: <strong>{ex.expectedReturnDate}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => onAuthorize(ex.id, false, 'Declined by parent')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                  <button
                    onClick={() => onAuthorize(ex.id, true, 'Authorized by parent')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Authorize Leave</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ward Safety & Residence Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Safety & Location Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs md:col-span-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Current Campus Status
          </span>
          {currentlyAdmittedMedical ? (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300">
                <HeartPulse className="w-4 h-4 text-rose-600" />
                <span>Admitted to Campus Sick Bay</span>
              </div>
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                Reason: {currentlyAdmittedMedical.complaint}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                Attending Staff: {currentlyAdmittedMedical.attendingStaff}
              </p>
            </div>
          ) : activeOffCampusExeat ? (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Currently Off Campus on Leave</span>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Destination: {activeOffCampusExeat.destination}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                Return Deadline: {activeOffCampusExeat.expectedReturnDate}
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>On Campus in Residence</span>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Attending scheduled classes and dormitory programs in good standing.
              </p>
            </div>
          )}
        </div>

        {/* Dormitory Details Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Residential Accommodation
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isBoarder ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600'
            }`}>
              {isBoarder ? 'Resident Boarder' : 'Day Scholar'}
            </span>
          </div>

          {isBoarder && allocation ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">House</span>
                <span className="font-bold text-slate-900 dark:text-white mt-0.5 block truncate">
                  {allocation.houseName || house?.name}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Room & Floor</span>
                <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                  Room {allocation.roomNumber} ({room?.floor || 'Floor 1'})
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Bed Assigned</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                  {allocation.bedNumber} ({allocation.bedType || 'Single'})
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Housemaster Phone</span>
                {house?.housemasterPhone ? (
                  <a
                    href={`tel:${house.housemasterPhone}`}
                    className="font-mono text-blue-600 dark:text-blue-400 mt-0.5 block hover:underline truncate"
                  >
                    {house.housemasterPhone}
                  </a>
                ) : (
                  <span className="text-slate-500 mt-0.5 block">{house?.housemasterName || 'Staff on Duty'}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="py-4 text-xs text-slate-500">
              Ward is registered as a Day Scholar and commutes daily.
            </div>
          )}
        </div>
      </div>

      {/* Ward Exeat Pass History */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Ward Exeat Leave History ({exeats.length})</span>
          </div>
        </div>

        {exeats.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No leave passes requested for {selectedWard?.firstName || 'this ward'}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Pass Ref</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Destination & Reason</th>
                  <th className="py-2.5 px-3">Leave Dates</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Gate Pass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {exeats.map((ex) => {
                  const isApproved = ex.status === 'approved' || ex.status === 'checked_out' || ex.status === 'checked_in';
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
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          ex.status === 'pending_parent'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : ex.status === 'approved' || ex.status === 'checked_in'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : ex.status === 'checked_out'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : ex.status === 'rejected'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        }`}>
                          {ex.status === 'pending_parent' ? 'Awaiting Your Consent' : ex.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {isApproved ? (
                          <button
                            onClick={() => onPrintExeat(ex)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            <span>View Slip</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Pending release</span>
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

      {/* Ward Clinic & Infirmary History */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <HeartPulse className="w-4 h-4 text-rose-500" />
            <span>Ward Health & Clinic History ({medicalLogs.length})</span>
          </div>
        </div>

        {medicalLogs.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <HeartPulse className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No clinic visits recorded for {selectedWard?.firstName || 'ward'}.</p>
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
