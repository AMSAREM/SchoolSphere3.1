import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  BoardingHouse,
  BoardingRoom,
  BoardingAllocation,
  BoardingExeat,
  BoardingRollCall,
  BoardingMedicalLog,
  Student
} from '../db/schema';
import { boardingApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import {
  Building,
  Bed,
  UserCheck,
  FileText,
  HeartPulse,
  Plus,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Printer,
  ChevronRight,
  LogOut,
  LogIn,
  Users,
  ShieldCheck,
  Calendar,
  Home,
  DoorOpen,
  ArrowRight,
  Trash2,
  Edit2,
  ExternalLink,
  Phone,
  User
} from 'lucide-react';

type BoardingTab = 'overview' | 'houses_and_rooms' | 'exeats' | 'roll_call' | 'medical_logs';

export default function BoardingManagement() {
  const { user, school } = useAuth();
  const { showToast } = useNotifications();

  // Tab State
  const [activeTab, setActiveTab] = useState<BoardingTab>('overview');
  const [selectedHouseFilter, setSelectedHouseFilter] = useState<string>('all');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isHouseModalOpen, setIsHouseModalOpen] = useState(false);
  const [editingHouse, setEditingHouse] = useState<BoardingHouse | null>(null);

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<BoardingRoom | null>(null);

  const [isAllocModalOpen, setIsAllocModalOpen] = useState(false);
  const [allocTargetRoom, setAllocTargetRoom] = useState<BoardingRoom | null>(null);
  const [allocTargetHouse, setAllocTargetHouse] = useState<BoardingHouse | null>(null);

  const [isExeatModalOpen, setIsExeatModalOpen] = useState(false);
  const [printingExeat, setPrintingExeat] = useState<BoardingExeat | null>(null);

  const [isMedicalModalOpen, setIsMedicalModalOpen] = useState(false);
  const [medicalTargetStudent, setMedicalTargetStudent] = useState<string>('');

  // Live Queries from Dexie
  const houses = useLiveQuery(() => db.boardingHouses.toArray()) || [];
  const rooms = useLiveQuery(() => db.boardingRooms.toArray()) || [];
  const allocations = useLiveQuery(() => db.boardingAllocations.where('status').equals('active').toArray()) || [];
  const exeats = useLiveQuery(() => db.boardingExeats.reverse().sortBy('createdAt')) || [];
  const rollCalls = useLiveQuery(() => db.boardingRollCalls.reverse().sortBy('createdAt')) || [];
  const medicalLogs = useLiveQuery(() => db.boardingMedicalLogs.reverse().sortBy('createdAt')) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];

  // Initial Sync from Supabase on mount
  useEffect(() => {
    handleRefresh();
  }, [school?.id]);

  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      await boardingApi.fetchData(school?.id);
      showToast('Boarding data synchronized with cloud database.', 'success');
    } catch (err: any) {
      console.warn('Boarding initial sync warning:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Calculations & Statistics
  const activeHouseList = useMemo(() => {
    if (selectedHouseFilter === 'all') return houses;
    return houses.filter(h => String(h.id) === selectedHouseFilter);
  }, [houses, selectedHouseFilter]);

  const totalCapacity = useMemo(() => {
    return houses.reduce((acc, h) => acc + (Number(h.capacity) || 0), 0);
  }, [houses]);

  const totalBoarders = allocations.length;
  const occupancyRate = totalCapacity > 0 ? Math.round((totalBoarders / totalCapacity) * 100) : 0;

  const activeExeats = useMemo(() => {
    return exeats.filter(e => e.status === 'approved' || e.status === 'checked_out');
  }, [exeats]);

  const sickBayAdmissions = useMemo(() => {
    return medicalLogs.filter(m => m.status === 'admitted_to_sickbay');
  }, [medicalLogs]);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayRollCalls = useMemo(() => {
    return rollCalls.filter(r => r.rollDate === todayStr);
  }, [rollCalls, todayStr]);

  // Determine user permission / role
  const canManage = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'creator' || user?.role === 'headteacher';

  // ==========================================
  // Form Submissions
  // ==========================================

  // 1. House Save
  const handleSaveHouse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const housePayload: Partial<BoardingHouse> = {
      id: editingHouse?.id || `house-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: school?.id,
      name: String(formData.get('name') || '').trim(),
      code: String(formData.get('code') || '').trim(),
      gender: (formData.get('gender') as any) || 'Mixed',
      housemasterName: String(formData.get('housemasterName') || '').trim(),
      housemasterPhone: String(formData.get('housemasterPhone') || '').trim(),
      assistantName: String(formData.get('assistantName') || '').trim(),
      motto: String(formData.get('motto') || '').trim(),
      color: String(formData.get('color') || '#2563EB'),
      capacity: Number(formData.get('capacity')) || 50,
      createdAt: editingHouse?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    try {
      await boardingApi.saveHouse(housePayload, school?.id);
      showToast(`House ${housePayload.name} saved successfully.`, 'success');
      setIsHouseModalOpen(false);
      setEditingHouse(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to save house', 'error');
    }
  };

  const handleDeleteHouse = async (houseId: string, houseName: string) => {
    if (!confirm(`Are you sure you want to delete ${houseName}? All room and bed allocations will be removed.`)) return;
    try {
      await boardingApi.deleteHouse(houseId, school?.id);
      showToast(`${houseName} removed.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete house', 'error');
    }
  };

  // 2. Room Save
  const handleSaveRoom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const targetHouseId = String(formData.get('houseId') || editingRoom?.houseId || houses[0]?.id || '');
    const roomPayload: Partial<BoardingRoom> = {
      id: editingRoom?.id || `room-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: school?.id,
      houseId: targetHouseId,
      roomNumber: String(formData.get('roomNumber') || '').trim(),
      floor: String(formData.get('floor') || 'Ground Floor').trim(),
      capacity: Number(formData.get('capacity')) || 8,
      gender: (formData.get('gender') as any) || 'Mixed',
      prefectName: String(formData.get('prefectName') || '').trim(),
      createdAt: editingRoom?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    try {
      await boardingApi.saveRoom(roomPayload, school?.id);
      showToast(`Room ${roomPayload.roomNumber} saved.`, 'success');
      setIsRoomModalOpen(false);
      setEditingRoom(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to save room', 'error');
    }
  };

  const handleDeleteRoom = async (roomId: string, roomNumber: string) => {
    if (!confirm(`Remove ${roomNumber}? Existing allocations in this room will be unassigned.`)) return;
    try {
      await boardingApi.deleteRoom(roomId, school?.id);
      showToast(`${roomNumber} removed.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete room', 'error');
    }
  };

  // 3. Bed Allocation Save
  const handleSaveAllocation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const studentId = String(formData.get('studentId') || '');
    const selectedStudent = students.find(s => s.studentId === studentId);
    if (!selectedStudent) {
      showToast('Please select a student from the school registry.', 'error');
      return;
    }

    const houseId = allocTargetHouse?.id || '';
    const houseName = allocTargetHouse?.name || '';
    const roomId = allocTargetRoom?.id || '';
    const roomNumber = allocTargetRoom?.roomNumber || '';
    const bedNumber = String(formData.get('bedNumber') || 'Bed 1');
    const bedType = String(formData.get('bedType') || 'Single');
    const notes = String(formData.get('notes') || '');

    const allocPayload: Partial<BoardingAllocation> = {
      id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: school?.id,
      studentId: selectedStudent.studentId,
      studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`.trim(),
      className: selectedStudent.class || 'Form 1',
      gender: selectedStudent.gender || 'Male',
      houseId,
      houseName,
      roomId,
      roomNumber,
      bedNumber,
      bedType,
      academicYear: school?.academic_year || '2025/2026',
      term: school?.current_term || 'Term 1',
      status: 'active',
      assignedAt: Date.now(),
      notes
    };

    try {
      await boardingApi.assignBed(allocPayload, school?.id);
      showToast(`Assigned ${selectedStudent.firstName} to ${roomNumber} (${bedNumber}).`, 'success');
      setIsAllocModalOpen(false);
      setAllocTargetRoom(null);
      setAllocTargetHouse(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to assign bed space', 'error');
    }
  };

  const handleVacateBed = async (allocId: string, studentName: string) => {
    if (!confirm(`Vacate bed space allocated to ${studentName}?`)) return;
    try {
      await boardingApi.deleteAllocation(allocId, school?.id);
      showToast(`Bed space vacated for ${studentName}.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to vacate bed space', 'error');
    }
  };

  // 4. Exeat Submission
  const handleSaveExeat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const studentId = String(formData.get('studentId') || '');
    const selectedStudent = students.find(s => s.studentId === studentId);
    if (!selectedStudent) {
      showToast('Please select a student from the registry.', 'error');
      return;
    }

    const currentAlloc = allocations.find(a => a.studentId === studentId);
    const houseId = currentAlloc?.houseId || houses[0]?.id || '';
    const houseName = currentAlloc?.houseName || houses[0]?.name || '';

    const exeatPayload: Partial<BoardingExeat> = {
      id: `exeat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: school?.id,
      studentId: selectedStudent.studentId,
      studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`.trim(),
      className: selectedStudent.class || 'Form 1',
      houseId,
      houseName,
      passCode: `EXT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      exeatType: String(formData.get('exeatType') || 'Weekend Exeat'),
      reason: String(formData.get('reason') || '').trim(),
      destination: String(formData.get('destination') || '').trim(),
      parentConsent: formData.get('parentConsent') === 'on',
      parentName: String(formData.get('parentName') || selectedStudent.guardianName || '').trim(),
      parentPhone: String(formData.get('parentPhone') || selectedStudent.guardianPhone || '').trim(),
      departureDate: String(formData.get('departureDate') || ''),
      expectedReturnDate: String(formData.get('expectedReturnDate') || ''),
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await boardingApi.submitExeat(exeatPayload, school?.id);
      showToast(`Exeat leave pass generated: ${exeatPayload.passCode}`, 'success');
      setIsExeatModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to submit exeat request', 'error');
    }
  };

  const handleUpdateExeatStatus = async (
    exeat: BoardingExeat,
    newStatus: 'pending' | 'approved' | 'rejected' | 'checked_out' | 'checked_in'
  ) => {
    try {
      const actor = user?.fullName || user?.username || 'House Staff';
      await boardingApi.updateExeatStatus(exeat.id, newStatus, undefined, actor, school?.id);
      const label =
        newStatus === 'approved' ? 'Approved by Housemaster' :
        newStatus === 'checked_out' ? 'Checked Out at Campus Gate' :
        newStatus === 'checked_in' ? 'Checked In & Returned' :
        newStatus === 'rejected' ? 'Rejected' : newStatus;
      showToast(`Exeat ${exeat.passCode} updated: ${label}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update exeat status', 'error');
    }
  };

  // 5. Medical Log Save
  const handleSaveMedicalLog = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const studentId = String(formData.get('studentId') || '');
    const selectedStudent = students.find(s => s.studentId === studentId);
    if (!selectedStudent) {
      showToast('Please select a student.', 'error');
      return;
    }

    const currentAlloc = allocations.find(a => a.studentId === studentId);
    const status = formData.get('status') as any || 'treated';
    const now = Date.now();

    const medPayload: Partial<BoardingMedicalLog> = {
      id: `med-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: school?.id,
      studentId: selectedStudent.studentId,
      studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`.trim(),
      className: selectedStudent.class || 'Form 1',
      houseId: currentAlloc?.houseId || '',
      houseName: currentAlloc?.houseName || '',
      visitDate: String(formData.get('visitDate') || todayStr),
      complaint: String(formData.get('complaint') || '').trim(),
      vitals: String(formData.get('vitals') || '').trim(),
      treatmentGiven: String(formData.get('treatmentGiven') || '').trim(),
      attendingStaff: String(formData.get('attendingStaff') || user?.fullName || 'Nurse / House Matron'),
      status,
      admittedAt: status === 'admitted_to_sickbay' ? now : undefined,
      dischargedAt: status === 'discharged' || status === 'treated' ? now : undefined,
      createdAt: now
    };

    try {
      await boardingApi.saveMedicalLog(medPayload, school?.id);
      showToast(`Health record saved for ${selectedStudent.firstName}.`, 'success');
      setIsMedicalModalOpen(false);
      setMedicalTargetStudent('');
    } catch (err: any) {
      showToast(err.message || 'Failed to save health record', 'error');
    }
  };

  const handleDischargeStudent = async (log: BoardingMedicalLog) => {
    try {
      await boardingApi.saveMedicalLog({
        ...log,
        status: 'discharged',
        dischargedAt: Date.now()
      }, school?.id);
      showToast(`${log.studentName} discharged from sick bay.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update record', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Boarding & Residential Management
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Houses, dormitory room allocations, multi-stage exeats, and evening roll calls
                  </p>
                </div>
              </div>
            </div>

            {/* Top Bar Controls */}
            <div className="flex items-center flex-wrap gap-2.5">
              {/* House Scope Filter */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
                <span className="px-2 text-slate-500 font-medium">House:</span>
                <select
                  value={selectedHouseFilter}
                  onChange={(e) => setSelectedHouseFilter(e.target.value)}
                  className="bg-transparent text-slate-900 dark:text-white font-medium focus:outline-none cursor-pointer pr-2"
                >
                  <option value="all">All Houses ({houses.length})</option>
                  {houses.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>

              {/* Sync Button */}
              <button
                onClick={handleRefresh}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Supabase'}</span>
              </button>

              {/* Primary Action Button based on Tab */}
              {activeTab === 'houses_and_rooms' && canManage && (
                <button
                  onClick={() => { setEditingHouse(null); setIsHouseModalOpen(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New House</span>
                </button>
              )}

              {activeTab === 'exeats' && (
                <button
                  onClick={() => setIsExeatModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Issue Exeat Pass</span>
                </button>
              )}

              {activeTab === 'medical_logs' && (
                <button
                  onClick={() => { setMedicalTargetStudent(''); setIsMedicalModalOpen(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm whitespace-nowrap"
                >
                  <HeartPulse className="w-3.5 h-3.5" />
                  <span>Record Clinic Visit</span>
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 mt-4 overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-3">
            {[
              { id: 'overview', label: 'Overview & Census', icon: Home },
              { id: 'houses_and_rooms', label: 'Houses & Dorm Allocations', icon: Bed, count: allocations.length },
              { id: 'exeats', label: 'Exeat Passes', icon: FileText, count: activeExeats.length },
              { id: 'roll_call', label: 'Dorm Roll Call', icon: UserCheck },
              { id: 'medical_logs', label: 'Infirmary / Sick Bay', icon: HeartPulse, count: sickBayAdmissions.length }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as BoardingTab)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`px-1.5 py-0.2 text-[10px] rounded-md font-mono tabular-nums ${
                      isActive ? 'bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Boarding Census</span>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {totalBoarders}
              </span>
              <span className="text-xs text-slate-500">/ {totalCapacity} cap</span>
            </div>
            <div className="mt-2 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${occupancyRate > 90 ? 'bg-amber-500' : 'bg-blue-600'}`}
                style={{ width: `${Math.min(100, occupancyRate)}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500 flex justify-between">
              <span>Occupancy</span>
              <span className="font-mono tabular-nums font-semibold">{occupancyRate}%</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Houses & Rooms</span>
              <Building className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {houses.length}
              </span>
              <span className="text-xs text-slate-500">Houses</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              <span className="font-mono tabular-nums">{rooms.length}</span> dormitory blocks configured
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Active Exeats</span>
              <LogOut className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {activeExeats.length}
              </span>
              <span className="text-xs text-slate-500">Outside Campus</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {exeats.filter(e => e.status === 'pending').length} requests pending review
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Sick Bay / Clinic</span>
              <HeartPulse className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                {sickBayAdmissions.length}
              </span>
              <span className="text-xs text-slate-500">Admitted</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {medicalLogs.length} cumulative medical visits logged
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: OVERVIEW & CENSUS                                       */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Action Tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => { setActiveTab('houses_and_rooms'); }}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-all text-left shadow-sm group"
              >
                <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                  <Bed className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Allocate Bed Space</div>
                  <div className="text-[11px] text-slate-500">Assign student to dorm</div>
                </div>
              </button>

              <button
                onClick={() => setIsExeatModalOpen(true)}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-all text-left shadow-sm group"
              >
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Issue Exeat Pass</div>
                  <div className="text-[11px] text-slate-500">Weekend, medical, day leave</div>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('roll_call')}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-purple-500 transition-all text-left shadow-sm group"
              >
                <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Evening Roll Call</div>
                  <div className="text-[11px] text-slate-500">{todayRollCalls.length > 0 ? 'Conducted today' : 'Pending tonight'}</div>
                </div>
              </button>

              <button
                onClick={() => { setMedicalTargetStudent(''); setIsMedicalModalOpen(true); }}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-500 transition-all text-left shadow-sm group"
              >
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 group-hover:scale-105 transition-transform">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Log Health Visit</div>
                  <div className="text-[11px] text-slate-500">Infirmary record</div>
                </div>
              </button>
            </div>

            {/* House Overview Cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Residential Houses & Dormitory Blocks
                </h2>
                <span className="text-xs text-slate-500">
                  {houses.length} Active Houses
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {houses.map((house) => {
                  const houseRooms = rooms.filter(r => r.houseId === house.id);
                  const houseAllocations = allocations.filter(a => a.houseId === house.id);
                  const occ = house.capacity > 0 ? Math.round((houseAllocations.length / house.capacity) * 100) : 0;

                  return (
                    <div
                      key={house.id}
                      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: house.color || '#2563EB' }}
                            />
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                              {house.name}
                            </h3>
                          </div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                            {house.gender}
                          </span>
                        </div>

                        {house.motto && (
                          <p className="text-[11px] italic text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                            "{house.motto}"
                          </p>
                        )}

                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Housemaster:</span>
                            <span className="font-medium text-slate-900 dark:text-white truncate max-w-[130px]">
                              {house.housemasterName || 'Unassigned'}
                            </span>
                          </div>
                          {house.housemasterPhone && (
                            <div className="flex items-center justify-between text-slate-500">
                              <span>Phone:</span>
                              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                {house.housemasterPhone}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Dorm Rooms:</span>
                            <span className="font-mono font-medium text-slate-900 dark:text-white">
                              {houseRooms.length}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Occupancy</span>
                          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                            {houseAllocations.length} / {house.capacity} ({occ}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${Math.min(100, occ)}%`, backgroundColor: house.color || '#2563EB' }}
                          />
                        </div>

                        <button
                          onClick={() => {
                            setSelectedHouseFilter(String(house.id));
                            setActiveTab('houses_and_rooms');
                          }}
                          className="mt-3 w-full py-1.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <span>Manage Dorms</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Students Outside Campus On Exeat */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <LogOut className="w-4 h-4 text-amber-500" />
                    <span>Boarding Students Currently Outside Campus ({activeExeats.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Authorized leaves verified through security gate check-out
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('exeats')}
                  className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
                >
                  <span>View All Exeat Passes</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {activeExeats.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="font-medium text-slate-700 dark:text-slate-300">All boarding students accounted for on campus</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">No active exeats outside campus grounds at this moment.</p>
                </div>
              ) : (
                <>
                  {/* Mobile Cards (< 768px) */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-3 space-y-3">
                    {activeExeats.map(ex => (
                      <div key={ex.id} className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white text-xs">{ex.studentName}</p>
                            <p className="text-[10px] text-slate-500">{ex.houseName} · {ex.className}</p>
                          </div>
                          <span className="font-mono text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                            {ex.passCode}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Type & Destination</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{ex.exeatType} → {ex.destination}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Expected Return</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400">{ex.expectedReturnDate}</span>
                          </div>
                        </div>
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => handleUpdateExeatStatus(ex, 'checked_in')}
                            className="w-full sm:w-auto px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>Gate Check In</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table (>= 768px) */}
                  <div className="hidden md:block overflow-x-auto table-responsive-container">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Pass Ref</th>
                          <th className="py-2.5 px-3">Student Name</th>
                          <th className="py-2.5 px-3">House / Class</th>
                          <th className="py-2.5 px-3">Type & Reason</th>
                          <th className="py-2.5 px-3">Destination</th>
                          <th className="py-2.5 px-3">Expected Return</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeExeats.map(ex => (
                          <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-medium text-blue-600 dark:text-blue-400">
                              {ex.passCode}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                              {ex.studentName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">
                              <span>{ex.houseName}</span> · <span>{ex.className}</span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                              <span className="font-medium">{ex.exeatType}</span>
                              {ex.reason && <span className="text-slate-400 block text-[11px] truncate max-w-xs">{ex.reason}</span>}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                              {ex.destination}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {ex.expectedReturnDate}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => handleUpdateExeatStatus(ex, 'checked_in')}
                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100 transition-colors inline-flex items-center gap-1 cursor-pointer"
                              >
                                <LogIn className="w-3 h-3" />
                                <span>Gate Check In</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: HOUSES & DORM ALLOCATIONS                               */}
        {/* ============================================================== */}
        {activeTab === 'houses_and_rooms' && (
          <div className="space-y-6">
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active House:</span>
                <select
                  value={selectedHouseFilter}
                  onChange={(e) => setSelectedHouseFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  <option value="all">All Houses</option>
                  {houses.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                {canManage && (
                  <button
                    onClick={() => { setEditingRoom(null); setIsRoomModalOpen(true); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Dorm Room</span>
                  </button>
                )}
              </div>
            </div>

            {/* Houses and Rooms list */}
            {activeHouseList.map((house) => {
              const houseRooms = rooms.filter(r => r.houseId === house.id);

              return (
                <div
                  key={house.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm"
                >
                  {/* House Banner */}
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: house.color || '#2563EB' }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">{house.name}</h3>
                          <span className="text-xs text-slate-500 font-mono">({house.code || 'HOUSE'})</span>
                          <span className="text-xs text-slate-400">· {house.gender}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span>Housemaster: {house.housemasterName || 'Unassigned'}</span>
                          {house.housemasterPhone && <span className="ml-2 font-mono">({house.housemasterPhone})</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      {canManage && (
                        <>
                          <button
                            onClick={() => { setEditingHouse(house); setIsHouseModalOpen(true); }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Edit House"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteHouse(String(house.id), house.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Delete House"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Rooms Grid */}
                  <div className="p-4 space-y-6">
                    {houseRooms.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        <DoorOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>No dormitory rooms added yet for {house.name}.</p>
                        {canManage && (
                          <button
                            onClick={() => {
                              setEditingRoom({ houseId: house.id } as any);
                              setIsRoomModalOpen(true);
                            }}
                            className="mt-2 text-blue-600 dark:text-blue-400 font-medium hover:underline inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add first room</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      houseRooms.map((room) => {
                        const roomAllocations = allocations.filter(a => a.roomId === room.id);
                        const bedSlots = Array.from({ length: room.capacity }, (_, i) => {
                          const bedNumber = `Bed ${i + 1}`;
                          const alloc = roomAllocations.find(a => a.bedNumber === bedNumber);
                          return { bedNumber, alloc };
                        });

                        return (
                          <div
                            key={room.id}
                            className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50/30 dark:bg-slate-900/50"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <DoorOpen className="w-4 h-4 text-blue-600" />
                                <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                                  {room.roomNumber}
                                </h4>
                                <span className="text-[11px] text-slate-400">
                                  ({room.floor}) · {roomAllocations.length}/{room.capacity} Beds Occupied
                                </span>
                                {room.prefectName && (
                                  <span className="text-[11px] text-slate-500">· Prefect: {room.prefectName}</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setAllocTargetHouse(house);
                                    setAllocTargetRoom(room);
                                    setIsAllocModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 hover:bg-blue-100 transition-colors inline-flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Assign Bed</span>
                                </button>
                                {canManage && (
                                  <button
                                    onClick={() => handleDeleteRoom(String(room.id), room.roomNumber)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                    title="Delete Room"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Bed Slot Visual Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                              {bedSlots.map(({ bedNumber, alloc }, idx) => (
                                <div
                                  key={idx}
                                  className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between transition-all ${
                                    alloc
                                      ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-900/60 shadow-xs'
                                      : 'bg-slate-100/50 dark:bg-slate-900/50 border-dashed border-slate-200 dark:border-slate-800 text-slate-400'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-mono font-medium text-[11px] text-slate-600 dark:text-slate-400">
                                      {bedNumber}
                                    </span>
                                    {alloc ? (
                                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Occupied" />
                                    ) : (
                                      <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" title="Vacant" />
                                    )}
                                  </div>

                                  {alloc ? (
                                    <div>
                                      <div className="font-bold text-slate-900 dark:text-white truncate" title={alloc.studentName}>
                                        {alloc.studentName}
                                      </div>
                                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                        {alloc.className} · {alloc.gender}
                                      </div>
                                      <button
                                        onClick={() => handleVacateBed(String(alloc.id), alloc.studentName)}
                                        className="mt-2 text-[10px] text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-0.5"
                                      >
                                        <XCircle className="w-3 h-3" />
                                        <span>Vacate</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setAllocTargetHouse(house);
                                        setAllocTargetRoom(room);
                                        setIsAllocModalOpen(true);
                                      }}
                                      className="py-3 text-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                                    >
                                      + Vacant
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: EXEAT PASSES                                            */}
        {/* ============================================================== */}
        {activeTab === 'exeats' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student, pass code, or house..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={() => setIsExeatModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Issue New Exeat Pass</span>
              </button>
            </div>

            {/* Exeats Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {/* Exeats Mobile Cards (< 768px) */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-3 space-y-3">
              {exeats
                .filter(e => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    e.studentName.toLowerCase().includes(q) ||
                    e.passCode.toLowerCase().includes(q) ||
                    e.houseName.toLowerCase().includes(q) ||
                    e.destination.toLowerCase().includes(q)
                  );
                }).length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No exeat passes match your search.</p>
                </div>
              ) : (
                exeats
                  .filter(e => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      e.studentName.toLowerCase().includes(q) ||
                      e.passCode.toLowerCase().includes(q) ||
                      e.houseName.toLowerCase().includes(q) ||
                      e.destination.toLowerCase().includes(q)
                    );
                  })
                  .map((ex) => {
                    const statusColor =
                      ex.status === 'approved' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40' :
                      ex.status === 'checked_out' ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40' :
                      ex.status === 'checked_in' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' :
                      ex.status === 'rejected' ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40' :
                      'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';

                    return (
                      <div key={ex.id} className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white text-xs">{ex.studentName}</p>
                            <p className="text-[10px] text-slate-500">{ex.houseName} · {ex.className} · {ex.studentId}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                            {ex.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Pass Code</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{ex.passCode}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Destination</span>
                            <span className="text-slate-700 dark:text-slate-300 truncate block">{ex.destination}</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          <span>Out: {ex.departureDate}</span> · <span>In: {ex.expectedReturnDate}</span>
                        </div>
                        <div className="pt-2 border-t border-slate-200/40 dark:border-slate-700/40 flex items-center justify-between gap-2">
                          <button
                            onClick={() => setPrintingExeat(ex)}
                            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1 text-[11px] cursor-pointer"
                            title="Print Exeat Pass Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            {ex.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleUpdateExeatStatus(ex, 'approved')}
                                  className="px-2 py-1 text-[11px] font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleUpdateExeatStatus(ex, 'rejected')}
                                  className="px-2 py-1 text-[11px] font-medium rounded bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {ex.status === 'approved' && (
                              <button
                                onClick={() => handleUpdateExeatStatus(ex, 'checked_out')}
                                className="px-2.5 py-1 text-[11px] font-medium rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <LogOut className="w-3 h-3" />
                                <span>Check Out</span>
                              </button>
                            )}
                            {ex.status === 'checked_out' && (
                              <button
                                onClick={() => handleUpdateExeatStatus(ex, 'checked_in')}
                                className="px-2.5 py-1 text-[11px] font-medium rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <LogIn className="w-3 h-3" />
                                <span>Check In</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Exeats Desktop Table (>= 768px) */}
            <div className="hidden md:block overflow-x-auto table-responsive-container">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Pass Ref</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">House & Class</th>
                    <th className="py-3 px-4">Type & Reason</th>
                    <th className="py-3 px-4">Destination</th>
                    <th className="py-3 px-4">Dates & Duration</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {exeats.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>No exeat passes generated yet.</p>
                      </td>
                    </tr>
                  ) : (
                    exeats
                      .filter(e => {
                        if (!searchQuery) return true;
                        const q = searchQuery.toLowerCase();
                        return (
                          e.studentName.toLowerCase().includes(q) ||
                          e.passCode.toLowerCase().includes(q) ||
                          e.houseName.toLowerCase().includes(q) ||
                          e.destination.toLowerCase().includes(q)
                        );
                      })
                      .map((ex) => {
                        const statusColor =
                          ex.status === 'approved' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40' :
                          ex.status === 'checked_out' ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40' :
                          ex.status === 'checked_in' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' :
                          ex.status === 'rejected' ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40' :
                          'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';

                        return (
                          <tr key={ex.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-4 font-mono font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              {ex.passCode}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                              {ex.studentName}
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{ex.studentId}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              <div>{ex.houseName}</div>
                              <div className="text-[11px] text-slate-400">{ex.className}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900 dark:text-white">{ex.exeatType}</div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">{ex.reason || 'Personal / General Leave'}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                              <div>{ex.destination}</div>
                              {ex.parentPhone && (
                                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{ex.parentPhone}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-[11px] font-mono whitespace-nowrap">
                              <div className="text-slate-700 dark:text-slate-300">Out: {ex.departureDate}</div>
                              <div className="text-slate-500">In: {ex.expectedReturnDate}</div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${statusColor}`}>
                                {ex.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Print Pass Slip */}
                                <button
                                  onClick={() => setPrintingExeat(ex)}
                                  className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Print Exeat Pass Slip"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>

                                {/* Approval / Check-Out / Check-In workflow */}
                                {ex.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateExeatStatus(ex, 'approved')}
                                      className="px-2 py-1 text-[11px] font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleUpdateExeatStatus(ex, 'rejected')}
                                      className="px-2 py-1 text-[11px] font-medium rounded bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}

                                {ex.status === 'approved' && (
                                  <button
                                    onClick={() => handleUpdateExeatStatus(ex, 'checked_out')}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <LogOut className="w-3 h-3" />
                                    <span>Gate Check Out</span>
                                  </button>
                                )}

                                {ex.status === 'checked_out' && (
                                  <button
                                    onClick={() => handleUpdateExeatStatus(ex, 'checked_in')}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <LogIn className="w-3 h-3" />
                                    <span>Return Check In</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: DORM ROLL CALL                                          */}
        {/* ============================================================== */}
        {activeTab === 'roll_call' && (
          <RollCallSection
            houses={houses}
            allocations={allocations}
            exeats={exeats}
            medicalLogs={medicalLogs}
            schoolId={school?.id}
            onSaved={() => showToast('Roll call submitted successfully.', 'success')}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 5: INFIRMARY / SICK BAY                                    */}
        {/* ============================================================== */}
        {activeTab === 'medical_logs' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-rose-500" />
                  <span>Infirmary & Sick Bay Patient Register</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Track health complaints, vital signs, administered treatments, and sick bay admissions
                </p>
              </div>

              <button
                onClick={() => { setMedicalTargetStudent(''); setIsMedicalModalOpen(true); }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Patient Clinic Visit</span>
              </button>
            </div>

            {/* Medical Logs Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {/* Medical Logs Mobile Cards (< 768px) */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-3 space-y-3">
              {medicalLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <HeartPulse className="w-8 h-8 mx-auto mb-2 opacity-40 text-rose-500" />
                  <p>No infirmary visits recorded yet.</p>
                </div>
              ) : (
                medicalLogs.map((log) => {
                  const statusBadgeColor =
                    log.status === 'admitted_to_sickbay' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                    log.status === 'referred_to_hospital' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' :
                    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';

                  return (
                    <div key={log.id} className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-xs">{log.studentName}</p>
                          <p className="text-[10px] text-slate-500">{log.houseName || 'Boarder'} · {log.className} · {log.studentId}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusBadgeColor}`}>
                          {log.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/70 dark:border-slate-800 space-y-1.5 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Complaint / Symptoms</span>
                          <span className="text-slate-800 dark:text-slate-200 font-medium">{log.complaint}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Vitals</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400">{log.vitals || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Attending Staff</span>
                            <span className="text-slate-700 dark:text-slate-300">{log.attendingStaff}</span>
                          </div>
                        </div>
                        {log.treatmentGiven && (
                          <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-[10px] text-slate-400 block">Treatment</span>
                            <span className="text-slate-600 dark:text-slate-400">{log.treatmentGiven}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="font-mono text-slate-500 text-[10px]">{log.visitDate}</span>
                        {log.status === 'admitted_to_sickbay' && (
                          <button
                            onClick={() => handleDischargeStudent(log)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                          >
                            Discharge Patient
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Medical Logs Desktop Table (>= 768px) */}
            <div className="hidden md:block overflow-x-auto table-responsive-container">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Visit Date</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">House & Class</th>
                    <th className="py-3 px-4">Complaint / Symptoms</th>
                    <th className="py-3 px-4">Vitals</th>
                    <th className="py-3 px-4">Treatment Administered</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {medicalLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                        <HeartPulse className="w-8 h-8 mx-auto mb-2 opacity-40 text-rose-500" />
                        <p>No infirmary visits recorded yet.</p>
                      </td>
                    </tr>
                  ) : (
                    medicalLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {log.visitDate}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {log.studentName}
                          <div className="text-[10px] text-slate-400 font-mono">{log.studentId}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          <div>{log.houseName || 'Boarder'}</div>
                          <div className="text-[11px] text-slate-400">{log.className}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-900 dark:text-white font-medium max-w-xs">
                          {log.complaint}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {log.vitals || '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-xs">
                          <div>{log.treatmentGiven}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Staff: {log.attendingStaff}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                            log.status === 'admitted_to_sickbay' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                            log.status === 'referred_to_hospital' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' :
                            'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          }`}>
                            {log.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {log.status === 'admitted_to_sickbay' && (
                            <button
                              onClick={() => handleDischargeStudent(log)}
                              className="px-2 py-1 text-[11px] font-medium rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                            >
                              Discharge Patient
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL 1: ADD / EDIT HOUSE                                      */}
      {/* ============================================================== */}
      {isHouseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {editingHouse ? 'Edit Boarding House' : 'New Boarding House'}
            </h3>
            <form onSubmit={handleSaveHouse} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">House Name *</label>
                <input
                  name="name"
                  required
                  defaultValue={editingHouse?.name || ''}
                  placeholder="e.g. Aggrey House"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">House Code</label>
                  <input
                    name="code"
                    defaultValue={editingHouse?.code || ''}
                    placeholder="e.g. AGG-01"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Gender</label>
                  <select
                    name="gender"
                    defaultValue={editingHouse?.gender || 'Mixed'}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="Boys">Boys</option>
                    <option value="Girls">Girls</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Housemaster Name</label>
                  <input
                    name="housemasterName"
                    defaultValue={editingHouse?.housemasterName || ''}
                    placeholder="e.g. Mr. Emmanuel Mensah"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Contact Phone</label>
                  <input
                    name="housemasterPhone"
                    defaultValue={editingHouse?.housemasterPhone || ''}
                    placeholder="e.g. 0244123456"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Bed Capacity</label>
                  <input
                    type="number"
                    name="capacity"
                    defaultValue={editingHouse?.capacity || 80}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">House Color</label>
                  <input
                    type="color"
                    name="color"
                    defaultValue={editingHouse?.color || '#2563EB'}
                    className="w-full h-9 p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">House Motto</label>
                <input
                  name="motto"
                  defaultValue={editingHouse?.motto || ''}
                  placeholder="e.g. Only the best is good enough"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsHouseModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
                >
                  Save House
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: ADD / EDIT ROOM                                       */}
      {/* ============================================================== */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {editingRoom ? 'Edit Dormitory Room' : 'Add New Dormitory Room'}
            </h3>
            <form onSubmit={handleSaveRoom} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Assign to House *</label>
                <select
                  name="houseId"
                  defaultValue={editingRoom?.houseId || houses[0]?.id || ''}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {houses.map(h => (
                    <option key={h.id} value={h.id}>{h.name} ({h.gender})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Room / Dorm Name *</label>
                  <input
                    name="roomNumber"
                    required
                    defaultValue={editingRoom?.roomNumber || ''}
                    placeholder="e.g. Block A - Room 101"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Floor Level</label>
                  <input
                    name="floor"
                    defaultValue={editingRoom?.floor || 'Ground Floor'}
                    placeholder="Ground Floor, 1st Floor"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Bed Space Capacity</label>
                  <input
                    type="number"
                    name="capacity"
                    defaultValue={editingRoom?.capacity || 8}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Room Prefect</label>
                  <input
                    name="prefectName"
                    defaultValue={editingRoom?.prefectName || ''}
                    placeholder="Student Prefect Name"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRoomModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
                >
                  Save Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: ASSIGN STUDENT TO BED SPACE                           */}
      {/* ============================================================== */}
      {isAllocModalOpen && allocTargetRoom && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Assign Bed Space
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {allocTargetHouse?.name} · {allocTargetRoom.roomNumber} ({allocTargetRoom.floor})
            </p>

            <form onSubmit={handleSaveAllocation} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Select Student *</label>
                <select
                  name="studentId"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="">-- Choose Student from School Register --</option>
                  {students.map(s => {
                    const alreadyAllocated = allocations.some(a => a.studentId === s.studentId);
                    return (
                      <option key={s.studentId} value={s.studentId}>
                        {s.firstName} {s.lastName} ({s.studentId}) — {s.class} {alreadyAllocated ? '(Currently Boarder)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Bed Number</label>
                  <select
                    name="bedNumber"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  >
                    {Array.from({ length: allocTargetRoom.capacity }, (_, i) => `Bed ${i + 1}`).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Bed Type</label>
                  <select
                    name="bedType"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="Single">Single Bed</option>
                    <option value="Bunk Top">Bunk (Top)</option>
                    <option value="Bunk Bottom">Bunk (Bottom)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Allocation Notes</label>
                <input
                  name="notes"
                  placeholder="e.g. Near window, medical accommodation"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAllocModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
                >
                  Confirm Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: ISSUE EXEAT PASS                                      */}
      {/* ============================================================== */}
      {isExeatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Issue Official Exeat Pass
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Generates an authorized digital & printable campus departure slip with security reference code
            </p>

            <form onSubmit={handleSaveExeat} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Select Boarding Student *</label>
                <select
                  name="studentId"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="">-- Choose Student --</option>
                  {students.map(s => {
                    const alloc = allocations.find(a => a.studentId === s.studentId);
                    return (
                      <option key={s.studentId} value={s.studentId}>
                        {s.firstName} {s.lastName} ({s.studentId}) — {alloc ? alloc.houseName : s.class}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Exeat Category</label>
                  <select
                    name="exeatType"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="Weekend Exeat">Weekend Exeat</option>
                    <option value="Day Exeat">Day Exeat (Town Leave)</option>
                    <option value="Medical / Clinic">Medical / Hospital Visit</option>
                    <option value="Special / Family">Special / Family Event</option>
                    <option value="Mid-Term Exeat">Mid-Term Break Exeat</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Destination Location *</label>
                  <input
                    name="destination"
                    required
                    placeholder="e.g. Accra, Kumasi, Home address"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Reason for Leave *</label>
                <textarea
                  name="reason"
                  rows={2}
                  required
                  placeholder="Detail the reason for requesting campus leave..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Departure Date & Time *</label>
                  <input
                    type="datetime-local"
                    name="departureDate"
                    required
                    defaultValue={`${todayStr}T14:00`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Expected Return Date & Time *</label>
                  <input
                    type="datetime-local"
                    name="expectedReturnDate"
                    required
                    defaultValue={`${todayStr}T18:00`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="parentConsent"
                    name="parentConsent"
                    defaultChecked
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="parentConsent" className="font-semibold text-slate-900 dark:text-white cursor-pointer">
                    Parent / Guardian Consent Confirmed
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input
                    name="parentName"
                    placeholder="Guardian Name"
                    className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <input
                    name="parentPhone"
                    placeholder="Guardian Phone Number"
                    className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsExeatModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                >
                  Generate Exeat Pass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 5: PRINTABLE OFFICIAL EXEAT PASS SLIP                    */}
      {/* ============================================================== */}
      {printingExeat && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-base uppercase tracking-tight text-slate-900">
                  {school?.name || 'SchoolSphere Academy'}
                </h3>
                <p className="text-xs text-slate-500 font-semibold uppercase">
                  Boarding Department · Official Exeat Pass Slip
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-sm text-blue-600">
                  {printingExeat.passCode}
                </span>
                <div className="text-[10px] text-slate-400">Security Verification Ref</div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[10px]">Student Name:</span>
                  <span className="font-bold text-slate-900 text-sm">{printingExeat.studentName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Student ID / House:</span>
                  <span className="font-mono text-slate-800">{printingExeat.studentId} · {printingExeat.houseName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Exeat Category:</span>
                  <span className="font-semibold text-slate-800">{printingExeat.exeatType}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Class / Form:</span>
                  <span className="font-semibold text-slate-800">{printingExeat.className}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 text-[10px] block">Destination & Reason:</span>
                <p className="font-medium text-slate-800 bg-slate-50 p-2 rounded border border-slate-200">
                  {printingExeat.destination} — {printingExeat.reason}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Departure Window:</span>
                  <span className="font-mono font-semibold">{printingExeat.departureDate}</span>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Expected Return Deadline:</span>
                  <span className="font-mono font-semibold">{printingExeat.expectedReturnDate}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-dashed border-slate-300 grid grid-cols-3 gap-3 text-center text-[10px] text-slate-500">
                <div>
                  <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-serif italic text-slate-800">
                    {printingExeat.approvedBy || 'Approved'}
                  </div>
                  <span>Housemaster Sign</span>
                </div>
                <div>
                  <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-mono text-[9px] text-slate-600">
                    {printingExeat.checkedOutAt ? new Date(printingExeat.checkedOutAt).toLocaleTimeString() : '—'}
                  </div>
                  <span>Gate Departure Stamp</span>
                </div>
                <div>
                  <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-mono text-[9px] text-slate-600">
                    {printingExeat.checkedInAt ? new Date(printingExeat.checkedInAt).toLocaleTimeString() : '—'}
                  </div>
                  <span>Gate Return Stamp</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPrintingExeat(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Pass Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 6: LOG CLINIC / INFIRMARY VISIT                          */}
      {/* ============================================================== */}
      {isMedicalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Record Infirmary / Sick Bay Visit
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Logs patient symptoms, prescribed treatment, and bed admission status
            </p>

            <form onSubmit={handleSaveMedicalLog} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Select Student *</label>
                <select
                  name="studentId"
                  required
                  defaultValue={medicalTargetStudent}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="">-- Choose Student --</option>
                  {students.map(s => (
                    <option key={s.studentId} value={s.studentId}>
                      {s.firstName} {s.lastName} ({s.studentId}) — {s.class}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Visit Date</label>
                  <input
                    type="date"
                    name="visitDate"
                    defaultValue={todayStr}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Vitals (Temp / BP / Pulse)</label>
                  <input
                    name="vitals"
                    placeholder="e.g. 38.2°C, BP 118/75"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Complaint / Symptoms *</label>
                <textarea
                  name="complaint"
                  rows={2}
                  required
                  placeholder="e.g. Severe headache, feverish, stomach pains since morning"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Treatment Administered *</label>
                <textarea
                  name="treatmentGiven"
                  rows={2}
                  required
                  placeholder="e.g. Paracetamol 500mg, ORS, bed rest for 4 hours"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Admission Status</label>
                  <select
                    name="status"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                  >
                    <option value="treated">Treated & Returned to Dorm</option>
                    <option value="admitted_to_sickbay">Admitted to Sick Bay Bed</option>
                    <option value="referred_to_hospital">Referred to District Hospital</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Attending Staff</label>
                  <input
                    name="attendingStaff"
                    defaultValue={user?.fullName || 'Nurse / House Matron'}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMedicalModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-sm"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// ROLL CALL TERMINAL SUBCOMPONENT
// =========================================================================

interface RollCallSectionProps {
  houses: BoardingHouse[];
  allocations: BoardingAllocation[];
  exeats: BoardingExeat[];
  medicalLogs: BoardingMedicalLog[];
  schoolId?: string;
  onSaved: () => void;
}

function RollCallSection({
  houses,
  allocations,
  exeats,
  medicalLogs,
  schoolId,
  onSaved
}: RollCallSectionProps) {
  const [selectedHouseId, setSelectedHouseId] = useState<string>(String(houses[0]?.id || ''));
  const [sessionType, setSessionType] = useState<string>('evening');
  const [rollDate, setRollDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Student statuses for this roll call
  const [statuses, setStatuses] = useState<Record<string, { status: 'present' | 'absent' | 'exeat' | 'sick'; remarks?: string }>>({});

  // Get active house boarders
  const houseBoarders = useMemo(() => {
    return allocations.filter(a => String(a.houseId) === String(selectedHouseId));
  }, [allocations, selectedHouseId]);

  // Pre-fill statuses whenever house or date changes
  useEffect(() => {
    const initial: Record<string, { status: 'present' | 'absent' | 'exeat' | 'sick'; remarks?: string }> = {};

    houseBoarders.forEach(b => {
      // Check if on exeat
      const onExeat = exeats.some(
        e => e.studentId === b.studentId && (e.status === 'approved' || e.status === 'checked_out')
      );
      // Check if in sick bay
      const inSickBay = medicalLogs.some(
        m => m.studentId === b.studentId && m.status === 'admitted_to_sickbay'
      );

      if (onExeat) {
        initial[b.studentId] = { status: 'exeat', remarks: 'On authorized exeat' };
      } else if (inSickBay) {
        initial[b.studentId] = { status: 'sick', remarks: 'Admitted to sick bay' };
      } else {
        initial[b.studentId] = { status: 'present' };
      }
    });

    setStatuses(initial);
  }, [selectedHouseId, houseBoarders, exeats, medicalLogs]);

  const handleSetStatus = (studentId: string, status: 'present' | 'absent' | 'exeat' | 'sick') => {
    setStatuses(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status
      }
    }));
  };

  const handleMarkAllPresent = () => {
    setStatuses(prev => {
      const next = { ...prev };
      houseBoarders.forEach(b => {
        // Keep exeat and sick bay if flagged
        if (next[b.studentId]?.status !== 'exeat' && next[b.studentId]?.status !== 'sick') {
          next[b.studentId] = { status: 'present' };
        }
      });
      return next;
    });
  };

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let exeat = 0;
    let sick = 0;

    Object.values(statuses).forEach(item => {
      if (item.status === 'present') present++;
      else if (item.status === 'absent') absent++;
      else if (item.status === 'exeat') exeat++;
      else if (item.status === 'sick') sick++;
    });

    return { total: houseBoarders.length, present, absent, exeat, sick };
  }, [statuses, houseBoarders]);

  const handleSubmitRollCall = async () => {
    if (houseBoarders.length === 0) return;
    setIsSubmitting(true);

    const houseObj = houses.find(h => String(h.id) === String(selectedHouseId));
    const records = houseBoarders.map(b => ({
      studentId: b.studentId,
      studentName: b.studentName,
      status: statuses[b.studentId]?.status || 'present',
      remarks: statuses[b.studentId]?.remarks
    }));

    const rollCallPayload: Partial<BoardingRollCall> = {
      id: `rc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId,
      houseId: selectedHouseId,
      houseName: houseObj?.name || 'Boarding House',
      rollDate,
      sessionType,
      conductedBy: houseObj?.housemasterName || 'Housemaster',
      records,
      summary: counts,
      createdAt: Date.now()
    };

    try {
      await boardingApi.saveRollCall(rollCallPayload, schoolId);
      onSaved();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Session Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Select House</label>
            <select
              value={selectedHouseId}
              onChange={(e) => setSelectedHouseId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold"
            >
              {houses.map(h => (
                <option key={h.id} value={String(h.id)}>{h.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Session Type</label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              <option value="evening">Evening Roll Call (Inspection)</option>
              <option value="morning">Morning Roll Call</option>
              <option value="lights_out">Lights Out Check (10:00 PM)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Date</label>
            <input
              type="date"
              value={rollDate}
              onChange={(e) => setRollDate(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono"
            >
            </input>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllPresent}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Mark All Present
          </button>
          <button
            onClick={handleSubmitRollCall}
            disabled={isSubmitting || houseBoarders.length === 0}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Saving...' : 'Submit Roll Call'}</span>
          </button>
        </div>
      </div>

      {/* Summary Counters */}
      <div className="grid grid-cols-5 gap-3 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg text-center">
          <span className="text-slate-400 block text-[10px] uppercase">Roster Total</span>
          <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">{counts.total}</span>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 p-3 rounded-lg text-center">
          <span className="text-emerald-700 dark:text-emerald-300 block text-[10px] uppercase">Present</span>
          <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{counts.present}</span>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-3 rounded-lg text-center">
          <span className="text-rose-700 dark:text-rose-300 block text-[10px] uppercase">Absent (Unexcused)</span>
          <span className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400">{counts.absent}</span>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-3 rounded-lg text-center">
          <span className="text-amber-700 dark:text-amber-300 block text-[10px] uppercase">On Exeat</span>
          <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">{counts.exeat}</span>
        </div>
        <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 p-3 rounded-lg text-center">
          <span className="text-purple-700 dark:text-purple-300 block text-[10px] uppercase">In Sick Bay</span>
          <span className="text-lg font-bold font-mono text-purple-600 dark:text-purple-400">{counts.sick}</span>
        </div>
      </div>

      {/* Boarder Attendance List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h4 className="font-bold text-xs text-slate-900 dark:text-white">
            Boarder Roll Call List ({houseBoarders.length} students)
          </h4>
          <span className="text-xs text-slate-400">Click a badge to toggle attendance status</span>
        </div>

        {houseBoarders.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No students allocated to this house yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {houseBoarders.map((b) => {
              const currentStatus = statuses[b.studentId]?.status || 'present';

              return (
                <div
                  key={b.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                      {b.studentName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white">
                        {b.studentName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {b.roomNumber} · {b.bedNumber} ({b.bedType}) · {b.className}
                      </div>
                    </div>
                  </div>

                  {/* Attendance Status Buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      onClick={() => handleSetStatus(b.studentId, 'present')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        currentStatus === 'present'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      Present
                    </button>
                    <button
                      onClick={() => handleSetStatus(b.studentId, 'absent')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        currentStatus === 'absent'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      Absent
                    </button>
                    <button
                      onClick={() => handleSetStatus(b.studentId, 'exeat')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        currentStatus === 'exeat'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      Exeat
                    </button>
                    <button
                      onClick={() => handleSetStatus(b.studentId, 'sick')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        currentStatus === 'sick'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      Sick Bay
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
