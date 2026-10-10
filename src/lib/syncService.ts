import { db, normalizeStudentRecord, normalizeFeeTransactionRecord } from '../db/schema';
import { supabase, getCurrentSchoolId } from './supabase';

/**
 * Reconcile classes in Dexie IndexedDB in-place without creating duplicate rows
 */
export async function reconcileClassesInDexie(remoteClasses: any[], isFullSync = false) {
  if (!Array.isArray(remoteClasses)) return;
  if (isFullSync && remoteClasses.length === 0) {
    await db.classes.clear();
    return;
  }
  const localClasses = await db.classes.toArray();
  const nameMap = new Map<string, any>();
  const idMap = new Map<string | number, any>();

  for (const local of localClasses) {
    if (local.id) idMap.set(local.id, local);
    const key = (local.name || '').trim().toLowerCase();
    if (key && !nameMap.has(key)) {
      nameMap.set(key, local);
    } else if (key && nameMap.has(key)) {
      // Remove duplicate local class
      if (local.id) await db.classes.delete(local.id);
    }
  }

  const remoteNames = new Set<string>();
  const remoteIds = new Set<string | number>();

  for (const remote of remoteClasses) {
    if (!remote || !remote.name) continue;
    const key = String(remote.name).trim().toLowerCase();
    remoteNames.add(key);
    const remoteNumId = remote.id != null && !isNaN(Number(remote.id)) ? Number(remote.id) : undefined;
    if (remoteNumId !== undefined) remoteIds.add(remoteNumId);
    else if (remote.id) remoteIds.add(remote.id);

    let existing = nameMap.get(key);
    if (!existing && remoteNumId !== undefined && idMap.has(remoteNumId)) {
      existing = idMap.get(remoteNumId);
    } else if (!existing && remote.id && idMap.has(remote.id)) {
      existing = idMap.get(remote.id);
    }

    if (existing) {
      const targetId = remoteNumId !== undefined ? remoteNumId : existing.id;
      if (existing.id && existing.id !== targetId) {
        await db.classes.delete(existing.id);
      }
      await db.classes.put({
        ...existing,
        ...remote,
        id: targetId,
        remoteId: remote.id ?? existing.remoteId
      });
    } else {
      if (remoteNumId !== undefined) {
        await db.classes.put({ ...remote, id: remoteNumId, remoteId: remote.id });
        nameMap.set(key, { ...remote, id: remoteNumId });
      } else {
        const { id, ...rest } = remote;
        const newId = await db.classes.add(rest);
        nameMap.set(key, { ...remote, id: newId });
      }
    }
  }

  // Prune local classes that were deleted or renamed remotely during full sync
  if (isFullSync && remoteClasses.length > 0) {
    const freshLocals = await db.classes.toArray();
    for (const local of freshLocals) {
      const key = (local.name || '').trim().toLowerCase();
      const hasName = key && remoteNames.has(key);
      const hasId = local.id && remoteIds.has(local.id);
      if (!hasName && !hasId && local.id) {
        await db.classes.delete(local.id);
      }
    }
  }
}

/**
 * Reconcile teachers in Dexie IndexedDB in-place without creating duplicate rows
 */
export async function reconcileTeachersInDexie(remoteTeachers: any[], isFullSync = false) {
  if (!Array.isArray(remoteTeachers)) return;
  if (isFullSync && remoteTeachers.length === 0) {
    await db.teachers.clear();
    return;
  }
  const localTeachers = await db.teachers.toArray();
  const staffMap = new Map<string, any>();
  const idMap = new Map<string | number, any>();

  for (const local of localTeachers) {
    if (local.id) idMap.set(local.id, local);
    const staffId = (local.staffId || (local as any).staff_id || '').trim().toLowerCase();
    const nameKey = `${local.firstName || ''}_${local.lastName || ''}`.trim().toLowerCase();
    const key = staffId || nameKey;
    if (key && !staffMap.has(key)) {
      staffMap.set(key, local);
    } else if (key && staffMap.has(key)) {
      if (local.id) await db.teachers.delete(local.id);
    }
  }

  const remoteStaffIds = new Set<string>();
  const remoteIds = new Set<string | number>();

  for (const remote of remoteTeachers) {
    if (!remote) continue;
    const staffId = (remote.staffId || remote.staff_id || '').trim().toLowerCase();
    if (staffId) remoteStaffIds.add(staffId);
    const remoteNumId = remote.id != null && !isNaN(Number(remote.id)) ? Number(remote.id) : undefined;
    if (remoteNumId !== undefined) remoteIds.add(remoteNumId);
    else if (remote.id) remoteIds.add(remote.id);

    let existing = staffId ? staffMap.get(staffId) : null;
    if (!existing && remoteNumId !== undefined && idMap.has(remoteNumId)) {
      existing = idMap.get(remoteNumId);
    } else if (!existing && remote.id && idMap.has(remote.id)) {
      existing = idMap.get(remote.id);
    }

    const rawAssigned = remote.assignedClasses ?? remote.assigned_classes;
    const payload = {
      ...remote,
      staffId: remote.staffId || remote.staff_id || existing?.staffId || '',
      firstName: remote.firstName || remote.first_name || existing?.firstName || '',
      lastName: remote.lastName || remote.last_name || existing?.lastName || '',
      assignedClasses: typeof rawAssigned === 'string' ? JSON.parse(rawAssigned || '[]') : (rawAssigned || []),
      subjects: typeof remote.subjects === 'string' ? JSON.parse(remote.subjects || '[]') : (remote.subjects || [])
    };

    if (existing) {
      const targetId = remoteNumId !== undefined ? remoteNumId : existing.id;
      if (existing.id && existing.id !== targetId) {
        await db.teachers.delete(existing.id);
      }
      await db.teachers.put({
        ...existing,
        ...payload,
        id: targetId,
        remoteId: remote.id ?? existing.remoteId
      });
    } else {
      if (remoteNumId !== undefined) {
        await db.teachers.put({ ...payload, id: remoteNumId, remoteId: remote.id });
        if (staffId) staffMap.set(staffId, { ...payload, id: remoteNumId });
      } else {
        const { id, ...rest } = payload;
        const newId = await db.teachers.add(rest);
        if (staffId) staffMap.set(staffId, { ...payload, id: newId });
      }
    }
  }

  // Prune local teachers that were removed remotely during full sync
  if (isFullSync && remoteTeachers.length > 0) {
    const freshLocals = await db.teachers.toArray();
    for (const local of freshLocals) {
      const staffId = (local.staffId || (local as any).staff_id || '').trim().toLowerCase();
      const hasStaffId = staffId && remoteStaffIds.has(staffId);
      const hasId = local.id && remoteIds.has(local.id);
      if (!hasStaffId && !hasId && local.id) {
        await db.teachers.delete(local.id);
      }
    }
  }
}

/**
 * Reconcile subjects in Dexie IndexedDB in-place without creating duplicate rows
 */
export async function reconcileSubjectsInDexie(remoteSubjects: any[], isFullSync = false) {
  if (!Array.isArray(remoteSubjects)) return;
  if (isFullSync && remoteSubjects.length === 0) {
    await db.subjects.clear();
    return;
  }
  const localSubjects = await db.subjects.toArray();
  const codeMap = new Map<string, any>();
  const idMap = new Map<string | number, any>();

  for (const local of localSubjects) {
    if (local.id) idMap.set(local.id, local);
    const code = (local.code || '').trim().toLowerCase();
    const name = (local.name || '').trim().toLowerCase();
    const key = code || name;
    if (key && !codeMap.has(key)) {
      codeMap.set(key, local);
    } else if (key && codeMap.has(key)) {
      if (local.id) await db.subjects.delete(local.id);
    }
  }

  const remoteCodes = new Set<string>();
  const remoteNames = new Set<string>();
  const remoteIds = new Set<string | number>();

  for (const remote of remoteSubjects) {
    if (!remote) continue;
    const code = (remote.code || '').trim().toLowerCase();
    const name = (remote.name || '').trim().toLowerCase();
    if (code) remoteCodes.add(code);
    if (name) remoteNames.add(name);
    const remoteNumId = remote.id != null && !isNaN(Number(remote.id)) ? Number(remote.id) : undefined;
    if (remoteNumId !== undefined) remoteIds.add(remoteNumId);
    else if (remote.id) remoteIds.add(remote.id);

    const key = code || name;
    let existing = key ? codeMap.get(key) : null;
    if (!existing && remoteNumId !== undefined && idMap.has(remoteNumId)) {
      existing = idMap.get(remoteNumId);
    } else if (!existing && remote.id && idMap.has(remote.id)) {
      existing = idMap.get(remote.id);
    }

    const rawApplicable = remote.applicableClasses ?? remote.applicable_classes;
    const isCore = Boolean(remote.isCore ?? remote.is_core ?? (remote.category === 'Core'));
    const payload = {
      ...remote,
      isCore,
      is_core: isCore,
      category: remote.category || (isCore ? 'Core' : 'General'),
      level: remote.level || 'All Classes',
      description: remote.description || '',
      department: remote.department || '',
      creditHours: Number(remote.creditHours ?? remote.credit_hours ?? 3) || 3,
      credit_hours: Number(remote.creditHours ?? remote.credit_hours ?? 3) || 3,
      status: remote.status || remote.registrationStatus || 'Available',
      applicableClasses: typeof rawApplicable === 'string' ? JSON.parse(rawApplicable || '[]') : (rawApplicable || ['All']),
      applicable_classes: typeof rawApplicable === 'string' ? JSON.parse(rawApplicable || '[]') : (rawApplicable || ['All'])
    };

    if (existing) {
      const targetId = remoteNumId !== undefined ? remoteNumId : existing.id;
      if (existing.id && existing.id !== targetId) {
        await db.subjects.delete(existing.id);
      }
      await db.subjects.put({
        ...existing,
        ...payload,
        id: targetId,
        remoteId: remote.id ?? existing.remoteId
      });
    } else {
      if (remoteNumId !== undefined) {
        await db.subjects.put({ ...payload, id: remoteNumId, remoteId: remote.id });
        if (key) codeMap.set(key, { ...payload, id: remoteNumId });
      } else {
        const { id, ...rest } = payload;
        const newId = await db.subjects.add(rest);
        if (key) codeMap.set(key, { ...payload, id: newId });
      }
    }
  }

  // Prune local subjects that were removed remotely during full sync
  if (isFullSync && remoteSubjects.length > 0) {
    const freshLocals = await db.subjects.toArray();
    for (const local of freshLocals) {
      const code = (local.code || '').trim().toLowerCase();
      const name = (local.name || '').trim().toLowerCase();
      const hasCode = code && remoteCodes.has(code);
      const hasName = name && remoteNames.has(name);
      const hasId = local.id && remoteIds.has(local.id);
      if (!hasCode && !hasName && !hasId && local.id) {
        await db.subjects.delete(local.id);
      }
    }
  }
}

/**
 * Reconcile students in Dexie IndexedDB in-place without creating duplicate rows
 */
export async function reconcileStudentsInDexie(remoteStudents: any[], isFullSync = false) {
  if (!Array.isArray(remoteStudents)) return;
  if (isFullSync && remoteStudents.length === 0) {
    await db.students.clear();
    return;
  }
  const localStudents = await db.students.toArray();
  const stuMap = new Map<string, any>();
  const idMap = new Map<string | number, any>();

  for (const local of localStudents) {
    if (local.id) idMap.set(local.id, local);
    const stuId = (local.studentId || (local as any).student_id || '').trim().toLowerCase();
    if (stuId && !stuMap.has(stuId)) {
      stuMap.set(stuId, local);
    } else if (stuId && stuMap.has(stuId)) {
      if (local.id) await db.students.delete(local.id);
    }
  }

  const remoteStudentIds = new Set<string>();
  const remoteIds = new Set<string | number>();

  for (const remote of remoteStudents) {
    if (!remote) continue;
    const norm = normalizeStudentRecord(remote);
    const stuId = (norm.studentId || norm.student_id || '').trim().toLowerCase();
    if (stuId) remoteStudentIds.add(stuId);
    const remoteNumId = norm.id != null && !isNaN(Number(norm.id)) ? Number(norm.id) : undefined;
    if (remoteNumId !== undefined) remoteIds.add(remoteNumId);
    else if (norm.id) remoteIds.add(norm.id);

    let existing = stuId ? stuMap.get(stuId) : null;
    if (!existing && remoteNumId !== undefined && idMap.has(remoteNumId)) {
      existing = idMap.get(remoteNumId);
    } else if (!existing && norm.id && idMap.has(norm.id)) {
      existing = idMap.get(norm.id);
    }

    if (existing) {
      const targetId = remoteNumId !== undefined ? remoteNumId : existing.id;
      if (existing.id && existing.id !== targetId) {
        await db.students.delete(existing.id);
      }
      await db.students.put({
        ...existing,
        ...norm,
        id: targetId,
        remoteId: norm.id ?? existing.remoteId
      });
    } else {
      if (remoteNumId !== undefined) {
        await db.students.put({ ...norm, id: remoteNumId, remoteId: norm.id } as any);
        if (stuId) stuMap.set(stuId, { ...norm, id: remoteNumId });
      } else {
        const { id, ...rest } = norm;
        const newId = await db.students.add(rest);
        if (stuId) stuMap.set(stuId, { ...norm, id: newId });
      }
    }
  }

  // Prune local students that were deleted remotely during full sync
  if (isFullSync && remoteStudents.length > 0) {
    const freshLocals = await db.students.toArray();
    for (const local of freshLocals) {
      const stuId = (local.studentId || (local as any).student_id || '').trim().toLowerCase();
      const hasStuId = stuId && remoteStudentIds.has(stuId);
      const hasId = local.id && remoteIds.has(local.id);
      if (!hasStuId && !hasId && local.id) {
        await db.students.delete(local.id);
      }
    }
  }
}

/**
 * Reconcile attendance records in Dexie
 */
export async function reconcileAttendanceInDexie(remoteRecords: any[]) {
  if (!Array.isArray(remoteRecords)) return;
  const local = await db.attendance.toArray();
  const map = new Map<string, any>();
  for (const item of local) {
    const k = `${item.studentId || (item as any).student_id}_${item.date}`;
    map.set(k, item);
  }

  for (const remote of remoteRecords) {
    if (!remote || !remote.date) continue;
    const studentId = remote.studentId || remote.student_id;
    if (!studentId) continue;
    const k = `${studentId}_${remote.date}`;
    const existing = map.get(k);
    if (existing) {
      await db.attendance.update(existing.id, { ...remote, studentId, id: existing.id });
    } else {
      const { id, ...rest } = remote;
      await db.attendance.add({ ...rest, studentId });
    }
  }
}

/**
 * Reconcile results records in Dexie
 */
export async function reconcileResultsInDexie(remoteResults: any[]) {
  if (!Array.isArray(remoteResults)) return;
  const local = await db.results.toArray();
  const map = new Map<string, any>();
  for (const item of local) {
    const k = `${item.studentId || (item as any).student_id}_${(item.subject || '').toLowerCase()}_${(item.term || '').toLowerCase()}`;
    map.set(k, item);
  }

  for (const remote of remoteResults) {
    if (!remote) continue;
    const studentId = remote.studentId || remote.student_id;
    const k = `${studentId}_${(remote.subject || '').toLowerCase()}_${(remote.term || '').toLowerCase()}`;
    const existing = map.get(k);
    const remoteExerciseScores = remote.exerciseScores ?? remote.exercise_scores;
    const remoteExerciseColumns = remote.exerciseColumns ?? remote.exercise_columns;
    const remoteRawCaScore = remote.rawCaScore ?? remote.raw_ca_score;
    const remoteRawCaMax = remote.rawCaMax ?? remote.raw_ca_max;

    const payload = {
      ...remote,
      studentId,
      classScore: Number(remote.classScore ?? remote.class_score ?? 0),
      examScore: Number(remote.examScore ?? remote.exam_score ?? 0),
      totalScore: Number(remote.totalScore ?? remote.total_score ?? 0),
      exerciseScores: typeof remoteExerciseScores === 'string'
        ? JSON.parse(remoteExerciseScores || '{}')
        : (remoteExerciseScores ?? existing?.exerciseScores),
      exerciseColumns: typeof remoteExerciseColumns === 'string'
        ? JSON.parse(remoteExerciseColumns || '[]')
        : (remoteExerciseColumns ?? existing?.exerciseColumns),
      rawCaScore: remoteRawCaScore !== undefined ? Number(remoteRawCaScore) : existing?.rawCaScore,
      rawCaMax: remoteRawCaMax !== undefined ? Number(remoteRawCaMax) : existing?.rawCaMax
    };
    if (existing) {
      await db.results.update(existing.id, { ...payload, id: existing.id });
    } else {
      const { id, ...rest } = payload;
      await db.results.add(rest);
    }
  }
}

/**
 * Reconcile term reports in Dexie
 */
export async function reconcileTermReportsInDexie(remoteReports: any[]) {
  if (!Array.isArray(remoteReports)) return;
  const local = await db.termReports.toArray();
  const map = new Map<string, any>();
  for (const item of local) {
    const k = `${item.studentId || (item as any).student_id}_${(item.term || '').toLowerCase()}`;
    map.set(k, item);
  }

  for (const remote of remoteReports) {
    if (!remote) continue;
    const studentId = remote.studentId || remote.student_id;
    const k = `${studentId}_${(remote.term || '').toLowerCase()}`;
    const existing = map.get(k);
    if (existing) {
      await db.termReports.update(existing.id, { ...remote, studentId, id: existing.id });
    } else {
      const { id, ...rest } = remote;
      await db.termReports.add({ ...rest, studentId });
    }
  }
}

/**
 * Reconcile settings in Dexie
 */
export async function reconcileSettingsInDexie(remoteSettings: any[]) {
  if (!Array.isArray(remoteSettings)) return;
  const local = await db.settings.toArray();
  const map = new Map<string, any>();
  for (const item of local) {
    if (item.key) map.set(item.key, item);
  }

  for (const remote of remoteSettings) {
    if (!remote || !remote.key) continue;
    const existing = map.get(remote.key);
    let value = remote.value;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch {}
    }
    if (remote.key === 'activeSirenBroadcast' && !value) {
      if (existing?.id !== undefined) {
        await db.settings.delete(existing.id);
      }
      continue;
    }
    if (remote.key === 'sirenLogs' && Array.isArray(value)) {
      try {
        localStorage.setItem('esepa_siren_logs', JSON.stringify(value));
      } catch {}
    }
    if (existing) {
      await db.settings.update(existing.id, { key: remote.key, value, id: existing.id });
    } else {
      const { id, ...rest } = remote;
      await db.settings.add({ ...rest, value });
    }
  }
}

/**
 * Reconcile fee transactions in Dexie IndexedDB in-place without creating duplicate rows
 */
export async function reconcileFeeTransactionsInDexie(remoteTransactions: any[], isFullSync = false) {
  if (!Array.isArray(remoteTransactions)) return;
  if (isFullSync && remoteTransactions.length === 0) {
    return;
  }
  const localTx = await db.feeTransactions.toArray();
  const receiptMap = new Map<string, any>();
  const idMap = new Map<string | number, any>();

  for (const local of localTx) {
    if (local.id) idMap.set(local.id, local);
    const rcp = String(local.receiptNumber || local.receipt_number || '').trim().toUpperCase();
    if (rcp && !receiptMap.has(rcp)) {
      receiptMap.set(rcp, local);
    } else if (rcp && receiptMap.has(rcp) && local.id) {
      await db.feeTransactions.delete(local.id);
    }
  }

  for (const remote of remoteTransactions) {
    if (!remote) continue;
    const norm = normalizeFeeTransactionRecord(remote);
    if (!norm.studentId || norm.amount <= 0) continue;
    const rcp = String(norm.receiptNumber || '').trim().toUpperCase();
    const remoteNumId = norm.id != null && !isNaN(Number(norm.id)) ? Number(norm.id) : undefined;

    let existing = rcp ? receiptMap.get(rcp) : null;
    if (!existing && remoteNumId !== undefined && idMap.has(remoteNumId)) {
      existing = idMap.get(remoteNumId);
    }

    if (existing) {
      const targetId = existing.id ?? remoteNumId;
      await db.feeTransactions.put({
        ...existing,
        ...norm,
        id: targetId,
        remoteId: remote.id ?? existing.remoteId
      });
    } else {
      const { id, ...rest } = norm;
      const newId = await db.feeTransactions.add({
        ...rest,
        remoteId: remote.id
      });
      if (rcp) receiptMap.set(rcp, { ...norm, id: newId });
    }
  }
}

/**
 * Reconcile SMS logs in Dexie IndexedDB in-place without creating duplicate rows
 */
export async function reconcileSmsLogsInDexie(remoteLogs: any[]) {
  if (!Array.isArray(remoteLogs) || remoteLogs.length === 0) return;
  const localLogs = await db.smsLogs.toArray();
  const sigMap = new Map<string, any>();
  for (const local of localLogs) {
    const sig = `${local.recipientPhone || ''}_${(local.message || '').slice(0, 80)}_${Math.floor((local.createdAt || 0) / 10000)}`;
    if (!sigMap.has(sig)) sigMap.set(sig, local);
  }

  for (const remote of remoteLogs) {
    if (!remote || !remote.message) continue;
    const payload = {
      recipientName: remote.recipientName || remote.recipient_name || 'Parent',
      recipientPhone: remote.recipientPhone || remote.recipient_phone || '',
      recipientType: (remote.recipientType || remote.recipient_type || 'Parent') as any,
      message: remote.message,
      type: (remote.type || 'Fee Reminder') as any,
      status: (remote.status || 'Sent') as any,
      createdAt: Number(remote.createdAt ?? remote.created_at ?? Date.now()) || Date.now()
    };
    const sig = `${payload.recipientPhone}_${payload.message.slice(0, 80)}_${Math.floor(payload.createdAt / 10000)}`;
    if (!sigMap.has(sig)) {
      const newId = await db.smsLogs.add(payload);
      sigMap.set(sig, { ...payload, id: newId });
    }
  }
}

/**
 * Reconcile promotion history in Dexie IndexedDB in-place without creating duplicate rows
 */
export async function reconcilePromotionHistoryInDexie(remotePromotions: any[], isFullSync = false) {
  if (!Array.isArray(remotePromotions)) return;
  if (isFullSync && remotePromotions.length === 0) {
    return;
  }
  const localPromos = await db.promotionHistory.toArray();
  const sigMap = new Map<string, any>();
  const idMap = new Map<number | string, any>();

  for (const local of localPromos) {
    if (local.id) idMap.set(local.id, local);
    const sig = `${local.studentIdentifier || local.studentId || ''}_${local.destClass || ''}_${local.academicYear || ''}_${local.term || ''}`;
    if (sig) sigMap.set(sig, local);
  }

  for (const remote of remotePromotions) {
    if (!remote) continue;
    const studentIdentifier = String(remote.studentIdentifier || remote.student_id || remote.studentId || '').trim();
    const studentName = String(remote.studentName || remote.student_name || 'Student').trim();
    const sourceClass = String(remote.sourceClass || remote.source_class || remote.fromClass || '').trim();
    const destClass = String(remote.destClass || remote.dest_class || remote.toClass || '').trim();
    const academicYear = String(remote.academicYear || remote.academic_year || '2025/2026').trim();
    const term = String(remote.term || 'Term 3').trim();
    const timestamp = Number(remote.timestamp || Date.now());

    const sig = `${studentIdentifier}_${destClass}_${academicYear}_${term}`;
    const existing = sigMap.get(sig) || (remote.id ? idMap.get(remote.id) : null);

    const payload: any = {
      ...(existing || {}),
      studentId: existing?.studentId ?? remote.studentId ?? studentIdentifier,
      studentIdentifier,
      studentName,
      sourceClass,
      destClass,
      academicYear,
      term,
      timestamp,
      previousFeesPaid: Number(remote.previousFeesPaid ?? remote.previous_fees_paid ?? existing?.previousFeesPaid ?? 0),
      previousTotalFees: Number(remote.previousTotalFees ?? remote.previous_total_fees ?? existing?.previousTotalFees ?? 0),
      previousFeeBreakdown: remote.previousFeeBreakdown ?? remote.previous_fee_breakdown ?? existing?.previousFeeBreakdown,
      previousFeePaidBreakdown: remote.previousFeePaidBreakdown ?? remote.previous_fee_paid_breakdown ?? existing?.previousFeePaidBreakdown,
      school_id: remote.school_id || remote.schoolId || existing?.school_id,
      schoolId: remote.school_id || remote.schoolId || existing?.schoolId,
      remoteId: remote.id
    };

    if (existing && existing.id) {
      await db.promotionHistory.update(existing.id, payload);
    } else {
      const newId = await db.promotionHistory.add(payload);
      sigMap.set(sig, { ...payload, id: newId });
    }
  }
}

/**
 * Master Sync: Pull all datasets from Backend/Supabase and reconcile Dexie in-place
 */
export async function syncAllDataFromBackend(schoolId?: string, forceFresh = true): Promise<boolean> {
  try {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    
    // 1. Fetch complete dataset from Backend /api/db/sync
    const url = `/api/db/sync?fresh=${forceFresh ? 'true' : 'false'}&school_id=${encodeURIComponent(targetSchoolId || '')}`;
    const token = typeof window !== 'undefined' ? (localStorage.getItem('esepa_auth_token') || sessionStorage.getItem('esepa_auth_token')) : null;
    const headers: Record<string, string> = { 'x-school-id': targetSchoolId || '' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { headers });

    if (res.ok) {
      const json = await res.json();
      const dataset = json.data || json;
      if (dataset && typeof dataset === 'object') {
        if (Array.isArray(dataset.classes)) await reconcileClassesInDexie(dataset.classes, true);
        if (Array.isArray(dataset.teachers)) await reconcileTeachersInDexie(dataset.teachers, true);
        if (Array.isArray(dataset.subjects)) await reconcileSubjectsInDexie(dataset.subjects, true);
        if (Array.isArray(dataset.students)) await reconcileStudentsInDexie(dataset.students, true);
        if (Array.isArray(dataset.attendance)) {
          if (dataset.attendance.length === 0) await db.attendance.clear();
          else await reconcileAttendanceInDexie(dataset.attendance);
        }
        if (Array.isArray(dataset.results)) {
          if (dataset.results.length === 0) await db.results.clear();
          else await reconcileResultsInDexie(dataset.results);
        }
        if (Array.isArray(dataset.termReports)) {
          if (dataset.termReports.length === 0) await db.termReports.clear();
          else await reconcileTermReportsInDexie(dataset.termReports);
        }
        if (Array.isArray(dataset.settings)) await reconcileSettingsInDexie(dataset.settings);
        if (Array.isArray(dataset.feeTransactions)) await reconcileFeeTransactionsInDexie(dataset.feeTransactions, true);
        if (Array.isArray(dataset.promotionHistory)) await reconcilePromotionHistoryInDexie(dataset.promotionHistory, true);
        if (Array.isArray(dataset.smsLogs)) await reconcileSmsLogsInDexie(dataset.smsLogs);
        if (Array.isArray(dataset.lessonNotes) && dataset.lessonNotes.length > 0) {
          const localNotes = await db.lessonNotes.toArray();
          const byNoteId = new Map<string, any>();
          for (const item of localNotes) {
            if (item.noteId) byNoteId.set(String(item.noteId), item);
          }
          for (const remote of dataset.lessonNotes) {
            if (!remote) continue;
            const noteId = String(remote.noteId || remote.note_id || '').trim();
            if (!noteId) continue;
            const existing = byNoteId.get(noteId);
            const normalized = {
              noteId,
              schoolId: remote.schoolId || remote.school_id || '',
              teacherId: String(remote.teacherId || remote.teacher_id || remote.teacherName || remote.teacher_name || ''),
              teacherName: String(remote.teacherName || remote.teacher_name || 'Subject Teacher'),
              term: (remote.term || 'Term 1') as 'Term 1' | 'Term 2' | 'Term 3',
              academicYear: String(remote.academicYear || remote.academic_year || '2026/2027'),
              weekNumber: Number(remote.weekNumber ?? remote.week_number ?? 1) || 1,
              class: String(remote.class || 'JHS 1'),
              subject: String(remote.subject || 'Mathematics'),
              lessonDate: String(remote.lessonDate || remote.lesson_date || ''),
              duration: String(remote.duration || '60 mins'),
              classSize: remote.classSize ?? remote.class_size ?? undefined,
              strand: String(remote.strand || ''),
              subStrand: String(remote.subStrand ?? remote.sub_strand ?? ''),
              contentStandard: String(remote.contentStandard ?? remote.content_standard ?? ''),
              objectives: String(remote.objectives ?? ''),
              tlms: String(remote.tlms ?? ''),
              coreCompetencies: String(remote.coreCompetencies ?? remote.core_competencies ?? ''),
              starterActivity: String(remote.starterActivity ?? remote.starter_activity ?? ''),
              mainActivity: String(remote.mainActivity ?? remote.main_activity ?? ''),
              plenaryActivity: String(remote.plenaryActivity ?? remote.plenary_activity ?? ''),
              evaluation: String(remote.evaluation ?? ''),
              teacherRemarks: String(remote.teacherRemarks ?? remote.teacher_remarks ?? ''),
              pdfFileName: remote.pdfFileName || remote.pdf_file_name || undefined,
              pdfFileSize: remote.pdfFileSize ?? remote.pdf_file_size ?? undefined,
              pdfData: remote.pdfData || remote.pdf_data || undefined,
              pdfUploadedAt: remote.pdfUploadedAt ?? remote.pdf_uploaded_at ?? undefined,
              status: (remote.status || 'Draft') as 'Draft' | 'Pending Review' | 'Approved' | 'Needs Revision' | 'Rejected',
              submittedAt: remote.submittedAt ?? remote.submitted_at ?? undefined,
              reviewedBy: remote.reviewedBy || remote.reviewed_by || undefined,
              reviewerRole: remote.reviewerRole || remote.reviewer_role || undefined,
              reviewerFeedback: remote.reviewerFeedback ?? remote.reviewer_feedback ?? undefined,
              reviewedAt: remote.reviewedAt ?? remote.reviewed_at ?? undefined,
              createdAt: Number(remote.createdAt ?? remote.created_at ?? Date.now()) || Date.now(),
              updatedAt: Number(remote.updatedAt ?? remote.updated_at ?? Date.now()) || Date.now()
            };
            if (existing?.id !== undefined) {
              await db.lessonNotes.update(existing.id, { ...normalized, pdfData: normalized.pdfData || existing.pdfData, id: existing.id });
            } else {
              await db.lessonNotes.add(normalized);
            }
          }
        }
        
        // Notify other components of database reconciliation
        window.dispatchEvent(new CustomEvent('database-reconciled', { detail: { timestamp: Date.now() } }));
        return true;
      }
    }
  } catch (err) {
    console.warn('[SyncService] Backend pull notice:', err);
  }
  return false;
}

/**
 * BroadcastChannel for instant cross-tab sync
 */
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('school_sphere_db_sync');
    broadcastChannel.onmessage = (event) => {
      if (event.data?.type === 'RECORD_UPDATED' || event.data?.type === 'SYNC_REQUEST') {
        syncAllDataFromBackend(undefined, true).catch(() => {});
      }
    };
  }
} catch (e) {}

export function broadcastLocalMutation(table: string, action: string, data: any) {
  try {
    broadcastChannel?.postMessage({
      type: 'RECORD_UPDATED',
      table,
      action,
      data,
      timestamp: Date.now()
    });
  } catch (e) {}
}

export interface OfflineQueueItem {
  id: string;
  table: string;
  action: 'insert' | 'update' | 'delete';
  payload: any;
  timestamp: number;
}

export function getOfflineQueueItems(): OfflineQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem('esepa_offline_queue') || '[]');
  } catch {
    return [];
  }
}

export function queueOfflineWrite(table: string, action: 'insert' | 'update' | 'delete', payload: any) {
  try {
    const queue: OfflineQueueItem[] = JSON.parse(localStorage.getItem('esepa_offline_queue') || '[]');
    queue.push({
      id: 'offline-' + Math.random().toString(36).substring(2, 9),
      table,
      action,
      payload,
      timestamp: Date.now()
    });
    localStorage.setItem('esepa_offline_queue', JSON.stringify(queue));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('offline-queue-changed'));
    }
  } catch (e) {}
}

export async function reconcileOfflineWrites(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const queueStr = localStorage.getItem('esepa_offline_queue');
    if (!queueStr) return;
    const queue: OfflineQueueItem[] = JSON.parse(queueStr);
    if (!queue.length) return;

    const remaining: OfflineQueueItem[] = [];
    for (const item of queue) {
      try {
        if (item.table === 'fee_payment') {
          const token = typeof window !== 'undefined' ? (localStorage.getItem('esepa_auth_token') || sessionStorage.getItem('esepa_auth_token')) : null;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          if (item.payload?.schoolId) headers['x-school-id'] = item.payload.schoolId;
          const res = await fetch('/api/fees/pay', {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload)
          });
          if (!res.ok) throw new Error('Offline fee payment replay failed');
        } else if (item.table === 'fee_batch_bill') {
          const token = typeof window !== 'undefined' ? (localStorage.getItem('esepa_auth_token') || sessionStorage.getItem('esepa_auth_token')) : null;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          if (item.payload?.schoolId) headers['x-school-id'] = item.payload.schoolId;
          const res = await fetch('/api/fees/batch-bill', {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload)
          });
          if (!res.ok) throw new Error('Offline batch bill replay failed');
        } else if (item.table === 'siren_api') {
          const token = typeof window !== 'undefined' ? (localStorage.getItem('esepa_auth_token') || sessionStorage.getItem('esepa_auth_token')) : null;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          if (item.payload?.schoolId) headers['x-school-id'] = item.payload.schoolId;
          const endpoint = String(item.payload?.endpoint || '/api/siren/sync');
          const method = String(item.payload?.method || 'POST').toUpperCase();
          const res = await fetch(endpoint, {
            method,
            headers,
            ...(method !== 'GET' && item.payload?.body !== undefined
              ? { body: JSON.stringify(item.payload.body) }
              : {})
          });
          if (!res.ok) throw new Error('Offline siren API replay failed');
        } else if (item.action === 'insert') {
          const { error } = await supabase.from(item.table).insert(item.payload);
          if (error) throw error;
        } else if (item.action === 'update') {
          const { id, ...data } = item.payload;
          const { error } = await supabase.from(item.table).update(data).eq('id', id);
          if (error) throw error;
        } else if (item.action === 'delete') {
          const { error } = await supabase.from(item.table).delete().eq('id', item.payload.id);
          if (error) throw error;
        }
      } catch (err) {
        remaining.push(item);
      }
    }

    if (remaining.length) {
      localStorage.setItem('esepa_offline_queue', JSON.stringify(remaining));
    } else {
      localStorage.removeItem('esepa_offline_queue');
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('offline-queue-changed'));
    }
  } catch (e) {}
}

let activeRealtimeChannel: any = null;

/**
 * Initialize Realtime Supabase + Polling Synchronizer
 */
export function initRealtimeAndAutoSync() {
  let isSubscribed = false;

  // Reconcile pending offline writes on initialization if online
  reconcileOfflineWrites().catch(() => {});

  // 1. Initial Pull immediately
  syncAllDataFromBackend(undefined, true).catch(() => {});

  // 2. Setup Supabase Postgres Changes Realtime Listener (idempotent)
  let currentChannel: any = null;
  try {
    if (supabase && typeof supabase.channel === 'function') {
      if (activeRealtimeChannel && typeof supabase.removeChannel === 'function') {
        try {
          supabase.removeChannel(activeRealtimeChannel);
        } catch {}
        activeRealtimeChannel = null;
      }
      if (typeof supabase.getChannels === 'function' && typeof supabase.removeChannel === 'function') {
        const existingChannels = supabase.getChannels() || [];
        for (const ch of existingChannels) {
          if (ch?.topic === 'realtime:schema-live-changes' || ch?.subTopic === 'schema-live-changes') {
            try {
              supabase.removeChannel(ch);
            } catch {}
          }
        }
      }

      currentChannel = supabase
        .channel('schema-live-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public' },
          async (payload: any) => {
            const table = payload.table;
            const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'
            const newRecord = payload.new;
            const oldRecord = payload.old;

            console.log(`[Supabase Realtime] ${eventType} on ${table}:`, newRecord || oldRecord);

            if (table === 'classes') {
              if (eventType === 'DELETE') {
                if (oldRecord?.id) await db.classes.delete(oldRecord.id);
                if (oldRecord?.name) await db.classes.where('name').equals(oldRecord.name).delete();
              } else if (newRecord) {
                await reconcileClassesInDexie([newRecord]);
              }
            } else if (table === 'teachers') {
              if (eventType === 'DELETE') {
                if (oldRecord?.id) await db.teachers.delete(oldRecord.id);
                if (oldRecord?.staffId) await db.teachers.where('staffId').equals(oldRecord.staffId).delete();
                if (oldRecord?.staff_id) await db.teachers.where('staffId').equals(oldRecord.staff_id).delete();
              } else if (newRecord) {
                await reconcileTeachersInDexie([newRecord]);
              }
            } else if (table === 'subjects') {
              if (eventType === 'DELETE') {
                if (oldRecord?.id) await db.subjects.delete(oldRecord.id);
                if (oldRecord?.code) await db.subjects.where('code').equals(oldRecord.code).delete();
                if (oldRecord?.name) await db.subjects.where('name').equals(oldRecord.name).delete();
              } else if (newRecord) {
                await reconcileSubjectsInDexie([newRecord]);
              }
            } else if (table === 'students') {
              if (eventType === 'DELETE') {
                if (oldRecord?.id) await db.students.delete(oldRecord.id);
                if (oldRecord?.studentId) await db.students.where('studentId').equals(oldRecord.studentId).delete();
                if (oldRecord?.student_id) await db.students.where('studentId').equals(oldRecord.student_id).delete();
              } else if (newRecord) {
                await reconcileStudentsInDexie([newRecord]);
              }
            } else if (table === 'attendance') {
              if (newRecord) await reconcileAttendanceInDexie([newRecord]);
            } else if (table === 'results') {
              if (newRecord) await reconcileResultsInDexie([newRecord]);
            } else if (table === 'settings') {
              if (newRecord) await reconcileSettingsInDexie([newRecord]);
            } else if (table === 'school_settings') {
              const sirenConsole = newRecord?.streams?.siren_console;
              if (sirenConsole && typeof sirenConsole === 'object') {
                const settingsToReconcile: any[] = [
                  { key: 'activeSirenBroadcast', value: sirenConsole.activeSirenBroadcast ?? null }
                ];
                if (Array.isArray(sirenConsole.bellSchedule)) {
                  settingsToReconcile.push({ key: 'bellSchedule', value: sirenConsole.bellSchedule });
                }
                if (Array.isArray(sirenConsole.recordedAudioList)) {
                  settingsToReconcile.push({ key: 'recordedAudioList', value: sirenConsole.recordedAudioList });
                }
                if (sirenConsole.acousticVolume !== undefined) {
                  settingsToReconcile.push({ key: 'acousticVolume', value: Number(sirenConsole.acousticVolume) });
                }
                if (Array.isArray(sirenConsole.sirenLogs)) {
                  settingsToReconcile.push({ key: 'sirenLogs', value: sirenConsole.sirenLogs });
                }
                await reconcileSettingsInDexie(settingsToReconcile);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('siren-state-updated', { detail: sirenConsole }));
                }
              } else {
                syncAllDataFromBackend(undefined, true).catch(() => {});
              }
            } else if (
              table === 'broadcasts' ||
              table === 'siren_schedules' ||
              table === 'siren_recordings' ||
              table === 'siren_logs'
            ) {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('siren-db-table-changed', { detail: { table, eventType, newRecord } }));
              }
              syncAllDataFromBackend(undefined, true).catch(() => {});
            } else if (table === 'fee_transactions') {
              if (newRecord) await reconcileFeeTransactionsInDexie([newRecord]);
            } else if (table === 'sms_logs') {
              if (newRecord) await reconcileSmsLogsInDexie([newRecord]);
            } else if (table === 'promotion_history') {
              if (eventType === 'DELETE') {
                if (oldRecord?.id) {
                  await db.promotionHistory.where('remoteId').equals(oldRecord.id).delete();
                  await db.promotionHistory.delete(oldRecord.id);
                }
              } else if (newRecord) {
                await reconcilePromotionHistoryInDexie([newRecord]);
              }
            } else {
              // Trigger a fresh sync for any other tables
              syncAllDataFromBackend(undefined, true).catch(() => {});
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            console.log('[Supabase Realtime] Connected and listening to database mutations');
          }
        });
      activeRealtimeChannel = currentChannel;
    }
  } catch (e) {
    console.warn('[SyncService] Supabase Realtime setup note:', e);
  }

  // 3. Fast Periodic Polling (every 5 seconds) to guarantee sync even without websocket
  const pollInterval = setInterval(() => {
    syncAllDataFromBackend(undefined, false).catch(() => {});
  }, 5000);

  // 4. Instant sync on window focus, tab visibility change, or network reconnect
  const onFocusOrVisible = () => {
    if (document.visibilityState === 'visible') {
      reconcileOfflineWrites().catch(() => {});
      syncAllDataFromBackend(undefined, true).catch(() => {});
    }
  };

  const onOnline = () => {
    reconcileOfflineWrites().catch(() => {});
    syncAllDataFromBackend(undefined, true).catch(() => {});
  };

  window.addEventListener('focus', onFocusOrVisible);
  document.addEventListener('visibilitychange', onFocusOrVisible);
  window.addEventListener('online', onOnline);

  return () => {
    clearInterval(pollInterval);
    window.removeEventListener('focus', onFocusOrVisible);
    document.removeEventListener('visibilitychange', onFocusOrVisible);
    window.removeEventListener('online', onOnline);
    if (currentChannel && supabase && typeof supabase.removeChannel === 'function') {
      try {
        supabase.removeChannel(currentChannel);
      } catch {}
      if (activeRealtimeChannel === currentChannel) {
        activeRealtimeChannel = null;
      }
    }
  };
}
