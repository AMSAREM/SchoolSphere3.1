import { supabase, getCurrentSchoolId } from './supabase';
import { db, normalizeStudentRecord, normalizeFeeTransactionRecord, FEE_TYPES } from '../db/schema';
import { 
  reconcileClassesInDexie, 
  reconcileTeachersInDexie, 
  reconcileSubjectsInDexie, 
  reconcileStudentsInDexie,
  reconcileAttendanceInDexie,
  reconcileResultsInDexie,
  reconcileTermReportsInDexie,
  reconcileSettingsInDexie,
  reconcileFeeTransactionsInDexie,
  reconcileSmsLogsInDexie,
  queueOfflineWrite,
  syncAllDataFromBackend,
  broadcastLocalMutation
} from './syncService';

/**
 * SchoolSphere 1.0 - Centralized Multi-Tenant API Client
 * Automatically applies school_id tenant scoping to all database and backend operations.
 */

export function getApiHeaders(schoolId?: string): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('esepa_auth_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (schoolId) {
    headers['x-school-id'] = schoolId;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function resolveActiveSchoolId(): Promise<string> {
  try {
    if (typeof localStorage !== 'undefined') {
      const authUserRaw = localStorage.getItem('esepa_auth_user');
      if (authUserRaw) {
        const parsedUser = JSON.parse(authUserRaw);
        const userSchoolId = parsedUser?.schoolId || parsedUser?.school_id;
        if (userSchoolId && typeof userSchoolId === 'string' && userSchoolId.trim()) {
          return userSchoolId.trim();
        }
      }
    }
  } catch {}

  try {
    const setting = await db.settings.where('key').equals('school_id').first();
    if (setting?.value && typeof setting.value === 'string' && setting.value.trim()) {
      return setting.value.trim();
    }
  } catch {}

  const currentId = await getCurrentSchoolId();
  return currentId || '';
}

// ==========================================
// 1. STUDENTS API
// ==========================================
export const studentsApi = {
  getAll: async (schoolId?: string, forceBackendFirst = true) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // 1. Primary Backend-First Retrieval (Server API / Supabase)
    if (forceBackendFirst) {
      try {
        const res = await fetch(`/api/students?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
          headers: getApiHeaders(targetSchoolId || undefined)
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const normalizedData = data.map(item => normalizeStudentRecord(item));
            try {
              await reconcileStudentsInDexie(normalizedData, true);
            } catch (e) {}
            return normalizedData;
          }
        }
      } catch (e) {
        console.warn('Notice querying /api/students backend:', e);
      }

      // Supabase direct fallback
      try {
        if (targetSchoolId) {
          const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq("school_id", targetSchoolId)
            .order('id', { ascending: false });

          if (!error && data && Array.isArray(data)) {
            const normalized = data.map(s => normalizeStudentRecord(s));
            try {
              await reconcileStudentsInDexie(normalized, true);
            } catch (e) {}
            return normalized;
          }
        }
      } catch (e) {
        console.warn('Notice querying Supabase students directly:', e);
      }
    }

    // Offline / Local Dexie DB Fallback
    const local = await db.students.toArray();
    const normalizedLocal = local.map(s => normalizeStudentRecord(s));
    return targetSchoolId ? normalizedLocal.filter((s: any) => s.schoolId === targetSchoolId || s.school_id === targetSchoolId) : normalizedLocal;
  },

  getById: async (id: number | string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) return normalizeStudentRecord(data);
    } catch (e) {}

    const local = await db.students.get(Number(id));
    return local ? normalizeStudentRecord(local) : undefined;
  },

  getByClass: async (className: string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    try {
      let query = supabase.from('students').select('*').eq('class', className);
      if (targetSchoolId) {
        query = query.eq("school_id", targetSchoolId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) return data.map(s => normalizeStudentRecord(s));
    } catch (e) {}

    const local = await db.students.where('class').equals(className).toArray();
    const normalizedLocal = local.map(s => normalizeStudentRecord(s));
    return targetSchoolId ? normalizedLocal.filter((s: any) => s.schoolId === targetSchoolId || s.school_id === targetSchoolId) : normalizedLocal;
  },

  /**
   * Option B: Push All Local Data to Supabase Backend Database
   */
  syncLocalToRemote: async (schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const rawStudents = await db.students.toArray();
    const normalizedStudents = rawStudents.map(s => normalizeStudentRecord(s));

    const payload = {
      students: normalizedStudents,
      classes: await db.classes.toArray(),
      subjects: await db.subjects.toArray(),
      teachers: await db.teachers.toArray(),
      attendance: await db.attendance.toArray(),
      results: await db.results.toArray(),
      termReports: await db.termReports.toArray(),
      settings: await db.settings.toArray(),
      inventory: await db.inventory.toArray(),
      expenses: await db.expenses.toArray(),
      promotionHistory: await db.promotionHistory.toArray(),
      feeTransactions: await db.feeTransactions.toArray(),
      smsLogs: await db.smsLogs.toArray()
    };

    const res = await fetch(`/api/db/sync?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
      method: 'POST',
      headers: getApiHeaders(targetSchoolId || undefined),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({ error: 'Sync failed' }));
      throw new Error(errJson.error || 'Database sync failed');
    }

    return await res.json();
  },

  create: async (student: any, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const normalized = normalizeStudentRecord({
      ...student,
      school_id: targetSchoolId,
      schoolId: targetSchoolId
    });

    // Save to local Dexie immediately
    const localId = await db.students.add(normalized);
    normalized.id = localId;

    // Direct server API call
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(normalized)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          const remoteNumId = json.data.id != null && !isNaN(Number(json.data.id)) ? Number(json.data.id) : localId;
          const finalNorm = normalizeStudentRecord({ ...json.data, id: remoteNumId, remoteId: json.data.id });
          if (localId !== remoteNumId) {
            await db.students.delete(localId);
          }
          await db.students.put(finalNorm);
          broadcastLocalMutation('students', 'create', finalNorm);
          return finalNorm;
        }
      }
    } catch (e) {
      console.warn('Notice calling /api/students:', e);
    }

    broadcastLocalMutation('students', 'create', normalized);
    return normalized;
  },

  bulkCreate: async (studentsList: any[], schoolId?: string, fileInfo?: { fileHash?: string; fileName?: string }) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const prepared = studentsList.map(s => normalizeStudentRecord({
      ...s,
      school_id: targetSchoolId,
      schoolId: targetSchoolId
    }));

    const remotePayload = prepared.map(s => {
      const copy: any = { ...s };
      delete copy.id;
      delete copy.schoolId;
      return copy;
    });

    // 1. Call server bulk endpoint first to enforce rate-limiting & duplicate file checks
    let serverSuccess = false;
    try {
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: {
          ...getApiHeaders(targetSchoolId || undefined),
          ...(fileInfo?.fileHash ? { 'x-file-hash': fileInfo.fileHash } : {})
        },
        body: JSON.stringify({ 
          students: remotePayload, 
          schoolId: targetSchoolId,
          fileHash: fileInfo?.fileHash,
          fileName: fileInfo?.fileName
        })
      });

      if (res.status === 409) {
        const json = await res.json();
        throw new Error(json.message || 'Duplicate file detected. This file was already imported.');
      }

      if (res.status === 429) {
        const json = await res.json();
        throw new Error(json.error || 'Rate limit exceeded on imports. Please wait before importing again.');
      }

      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          serverSuccess = true;
          const normalizedIncoming = json.data.map((item: any) => normalizeStudentRecord(item));
          await reconcileStudentsInDexie(normalizedIncoming, false);
          return normalizedIncoming;
        }
      }
    } catch (e: any) {
      if (e.message && (e.message.includes('Duplicate file') || e.message.includes('Rate limit'))) {
        throw e;
      }
      console.warn('Notice calling /api/students/bulk:', e);
    }

    // 2. Fallback direct client Supabase insert
    if (!serverSuccess) {
      try {
        const snakePayload = remotePayload.map((c: any) => ({
          student_id: c.studentId || c.student_id,
          first_name: c.firstName || c.first_name,
          last_name: c.lastName || c.last_name,
          class: c.class,
          gender: c.gender,
          date_of_birth: c.dateOfBirth || c.date_of_birth,
          guardian_name: c.guardianName || c.guardian_name,
          guardian_phone: c.guardianPhone || c.guardian_phone,
          fees_paid: c.feesPaid ?? c.fees_paid ?? 0,
          total_fees: c.totalFees ?? c.total_fees ?? 0,
          school_id: targetSchoolId
        }));
        const { data, error } = await supabase.from('students').insert(snakePayload).select();
        if (!error && data) {
          const normalizedIncoming = data.map((item: any) => normalizeStudentRecord(item));
          await reconcileStudentsInDexie(normalizedIncoming, false);
          return normalizedIncoming;
        }
      } catch (e) {
        console.warn('Notice bulk syncing students to Supabase directly:', e);
      }
    }

    // 3. Add to local Dexie fallback
    await reconcileStudentsInDexie(prepared, false);
    return prepared;
  },

  update: async (id: number | string, updates: any, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    
    // Find existing student from Dexie to retrieve primary keys and identifiers BEFORE modifying Dexie
    let existing: any = null;
    try {
      if (typeof id === 'number') {
        existing = await db.students.get(id);
      } else if (!isNaN(Number(id))) {
        existing = await db.students.get(Number(id));
      }
      if (!existing) {
        existing = await db.students.where('studentId').equals(String(id)).first();
      }
    } catch (e) {}

    const studentIdentifier = existing?.studentId || existing?.student_id || updates.studentId || updates.student_id || (typeof id === 'string' && isNaN(Number(id)) ? id : '');
    const remoteTargetId = existing?.remoteId || existing?.id || id;
    const mergedRecord = {
      ...(existing || {}),
      ...updates,
      school_id: targetSchoolId,
      schoolId: targetSchoolId
    };

    const normalizedUpdates = normalizeStudentRecord(mergedRecord);
    
    // 1. Update local Dexie immediately for snappy UI
    try {
      if (typeof id === 'number') {
        await db.students.update(id, normalizedUpdates);
      } else if (existing && existing.id) {
        await db.students.update(existing.id, normalizedUpdates);
      } else if (studentIdentifier) {
        const bySid = await db.students.where('studentId').equals(studentIdentifier).first();
        if (bySid && bySid.id) await db.students.update(bySid.id, normalizedUpdates);
      }
    } catch (e) {}

    // Prepare snake_case and camelCase payload for backend
    const cleanUpdates: any = { ...normalizedUpdates };
    delete cleanUpdates.id;
    delete cleanUpdates.schoolId;
    if (targetSchoolId) cleanUpdates.school_id = targetSchoolId;
    if (studentIdentifier) {
      cleanUpdates.studentId = studentIdentifier;
      cleanUpdates.student_id = studentIdentifier;
    }

    // 2. Call Server PUT /api/students/:id Endpoint
    try {
      const qParams = new URLSearchParams();
      if (targetSchoolId) qParams.set('school_id', targetSchoolId);
      if (studentIdentifier) qParams.set('student_id', studentIdentifier);

      const res = await fetch(`/api/students/${encodeURIComponent(String(remoteTargetId))}?${qParams.toString()}`, {
        method: 'PUT',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(cleanUpdates)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          const normResult = normalizeStudentRecord(json.data);
          await reconcileStudentsInDexie([normResult], false);
          broadcastLocalMutation('students', 'update', normResult);
          return normResult;
        }
      }
    } catch (e) {
      console.warn('Notice calling server PUT /api/students/:id:', e);
    }

    // 3. Direct Supabase fallback
    try {
      const snakeObj: any = {
        first_name: normalizedUpdates.firstName,
        last_name: normalizedUpdates.lastName,
        class: normalizedUpdates.class,
        gender: normalizedUpdates.gender,
        date_of_birth: normalizedUpdates.dateOfBirth,
        guardian_name: normalizedUpdates.guardianName,
        guardian_phone: normalizedUpdates.guardianPhone,
        fees_paid: normalizedUpdates.feesPaid,
        total_fees: normalizedUpdates.totalFees,
        fee_breakdown: normalizedUpdates.feeBreakdown,
        fee_paid_breakdown: normalizedUpdates.feePaidBreakdown,
        school_id: targetSchoolId
      };
      if (normalizedUpdates.house !== undefined) snakeObj.house = normalizedUpdates.house;
      if (normalizedUpdates.department !== undefined) snakeObj.department = normalizedUpdates.department;
      if (normalizedUpdates.photo !== undefined) snakeObj.photo = normalizedUpdates.photo;
      if (normalizedUpdates.status !== undefined) snakeObj.status = normalizedUpdates.status;
      if (studentIdentifier) snakeObj.student_id = studentIdentifier;

      if (remoteTargetId && !isNaN(Number(remoteTargetId))) {
        const { data } = await supabase
          .from('students')
          .update(snakeObj)
          .eq('id', Number(remoteTargetId))
          .select()
          .maybeSingle();
        if (data) {
          const norm = normalizeStudentRecord(data);
          await reconcileStudentsInDexie([norm], false);
          return norm;
        }
      }
      if (studentIdentifier) {
        let q = supabase.from('students').update(snakeObj).eq('student_id', studentIdentifier);
        if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
        const { data } = await q.select().maybeSingle();
        if (data) {
          const norm = normalizeStudentRecord(data);
          await reconcileStudentsInDexie([norm], false);
          return norm;
        }
      }
    } catch (e) {
      console.warn('Notice updating student in Supabase directly:', e);
    }

    return normalizedUpdates;
  },

  delete: async (id: number | string, schoolId?: string, studentId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    
    // 1. Get record info from Dexie before deleting to catch studentId and remoteId
    let foundStudentId = studentId;
    let remoteTargetId = id;
    try {
      let rec: any = null;
      if (typeof id === 'number') {
        rec = await db.students.get(id);
      } else if (!isNaN(Number(id))) {
        rec = await db.students.get(Number(id));
      }
      if (!rec && typeof id === 'string') {
        rec = await db.students.where('studentId').equals(id).first();
      }
      if (rec) {
        if (!foundStudentId && (rec.studentId || rec.student_id)) {
          foundStudentId = rec.studentId || rec.student_id;
        }
        if (rec.remoteId) remoteTargetId = rec.remoteId;
      }
    } catch (e) {}

    // 2. Immediate Local Dexie Deletion (Front-end reactive update)
    try {
      if (typeof id === 'number') {
        await db.students.delete(id);
      }
      if (typeof id === 'string') {
        await db.students.where('studentId').equals(id).delete();
        if (!isNaN(Number(id))) {
          await db.students.delete(Number(id));
        }
      }
      if (foundStudentId) {
        await db.students.where('studentId').equals(foundStudentId).delete();
      }
    } catch (e) {
      console.warn('Notice removing student from local Dexie DB:', e);
    }

    // 3. Server API Delete Endpoint
    let serverDeleted = false;
    try {
      const qParams = new URLSearchParams();
      if (targetSchoolId) qParams.set('school_id', targetSchoolId);
      if (foundStudentId) qParams.set('student_id', foundStudentId);
      
      const res = await fetch(`/api/students/${encodeURIComponent(String(remoteTargetId))}?${qParams.toString()}`, { 
        method: 'DELETE',
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) serverDeleted = true;
    } catch (e) {
      console.warn('Notice calling DELETE /api/students/:id:', e);
    }

    // 4. Supabase Direct Deletion fallback
    if (!serverDeleted) {
      try {
        if (remoteTargetId && !isNaN(Number(remoteTargetId))) {
          await supabase.from('students').delete().eq('id', Number(remoteTargetId));
        }
        if (foundStudentId) {
          let q = supabase.from('students').delete().eq('student_id', foundStudentId);
          if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
          await q;
        }
      } catch (e) {
        console.warn('Notice deleting student from Supabase directly:', e);
      }
    }

    broadcastLocalMutation('students', 'delete', { id: remoteTargetId, studentId: foundStudentId });
    return true;
  },

  bulkDelete: async (ids: (number | string)[], schoolId?: string, studentIds?: string[]) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    if (!ids || ids.length === 0) return { success: true, count: 0 };

    // 1. Gather all student identifiers and numeric IDs
    const numericIds: number[] = [];
    const allStudentIds: string[] = Array.isArray(studentIds) ? [...studentIds] : [];

    for (const rawId of ids) {
      if (typeof rawId === 'number') {
        numericIds.push(rawId);
      } else if (typeof rawId === 'string') {
        if (!isNaN(Number(rawId))) {
          numericIds.push(Number(rawId));
        } else {
          allStudentIds.push(rawId);
        }
      }
    }

    // Search Dexie for studentId strings and remoteIds for the numeric IDs BEFORE deleting
    try {
      if (numericIds.length > 0) {
        const records = await db.students.where('id').anyOf(numericIds).toArray();
        records.forEach((r: any) => {
          const sid = r.studentId || r.student_id;
          if (sid && !allStudentIds.includes(sid)) {
            allStudentIds.push(sid);
          }
          if (r.remoteId && !isNaN(Number(r.remoteId)) && !numericIds.includes(Number(r.remoteId))) {
            numericIds.push(Number(r.remoteId));
          }
        });
      }
    } catch (e) {}

    // 2. Immediate Local Dexie Deletion (Front-end reactive synchronization)
    try {
      if (numericIds.length > 0) {
        await db.students.bulkDelete(numericIds);
      }
      for (const sId of allStudentIds) {
        await db.students.where('studentId').equals(sId).delete();
      }
    } catch (e) {
      console.warn('Notice removing bulk students from local Dexie:', e);
    }

    // 3. Server API Bulk Delete Endpoint
    try {
      const res = await fetch('/api/students/bulk-delete', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({
          ids: numericIds,
          studentIds: allStudentIds,
          schoolId: targetSchoolId
        })
      });
      if (res.ok) {
        const json = await res.json();
        broadcastLocalMutation('students', 'bulk-delete', { ids: numericIds, studentIds: allStudentIds });
        return { success: true, count: json.count || ids.length };
      }
    } catch (e) {
      console.warn('Notice calling /api/students/bulk-delete:', e);
    }

    // 4. Supabase Direct Bulk Deletion fallback
    try {
      if (numericIds.length > 0) {
        await supabase.from('students').delete().in('id', numericIds);
      }
      if (allStudentIds.length > 0) {
        let q = supabase.from('students').delete().in('student_id', allStudentIds);
        if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
        await q;
      }
    } catch (e) {
      console.warn('Notice bulk deleting students from Supabase directly:', e);
    }

    broadcastLocalMutation('students', 'bulk-delete', { ids: numericIds, studentIds: allStudentIds });
    return { success: true, count: ids.length };
  }
};

// ==========================================
// 2. CLASSES API
// ==========================================
export const classesApi = {
  getAll: async (schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    
    // 1. Try Backend API
    try {
      const res = await fetch(`/api/classes?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          try {
            await reconcileClassesInDexie(data, true);
          } catch (e) {}
          return data;
        }
      }
    } catch (e) {}

    // 2. Try direct Supabase
    try {
      if (targetSchoolId) {
        const { data, error } = await supabase
          .from('classes')
          .select('*')
          .eq("school_id", targetSchoolId);

        if (!error && Array.isArray(data)) {
          try {
            await reconcileClassesInDexie(data, true);
          } catch (e) {}
          return data;
        }
      }
    } catch (e) {}

    // 3. Fallback to Local Dexie
    const local = await db.classes.toArray();
    return targetSchoolId ? local.filter((c: any) => c.schoolId === targetSchoolId || c.school_id === targetSchoolId) : local;
  },

  create: async (classData: { name: string; level: string; capacity?: number }, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const payload = {
      ...classData,
      capacity: classData.capacity || 50,
      school_id: targetSchoolId,
      schoolId: targetSchoolId,
      createdAt: Date.now()
    };
    
    // 1. Optimistic local Dexie entry
    const localId = await db.classes.add(payload as any);
    let officialRecord: any = { ...payload, id: localId };
    let persistedRemotely = false;

    // 2. Persist to Backend API
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          officialRecord = json.data;
          persistedRemotely = true;
          try {
            if (officialRecord.id && Number(officialRecord.id) !== localId) {
              await db.classes.delete(localId);
            }
            await reconcileClassesInDexie([officialRecord]);
          } catch (e) {}
        }
      }
    } catch (e) {}

    // 3. Direct Supabase sync only if Backend API did not persist
    if (!persistedRemotely) {
      try {
        const { data } = await supabase.from('classes').insert([{
          name: payload.name,
          level: payload.level,
          capacity: payload.capacity,
          school_id: targetSchoolId
        }]).select().single();
        if (data) {
          officialRecord = data;
          try {
            if (officialRecord.id && Number(officialRecord.id) !== localId) {
              await db.classes.delete(localId);
            }
            await reconcileClassesInDexie([officialRecord]);
          } catch (e) {}
        }
      } catch (e) {}
    }

    broadcastLocalMutation('classes', 'create', officialRecord);
    return officialRecord;
  },

  update: async (id: number | string, updates: Partial<{ name: string; level: string; capacity?: number }>, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // Look up existing class BEFORE updating Dexie so we capture originalName and remoteId
    let existing: any = null;
    try {
      if (typeof id === 'number') {
        existing = await db.classes.get(id);
      } else if (!isNaN(Number(id))) {
        existing = await db.classes.get(Number(id));
      }
      if (!existing) {
        existing = await db.classes.where('name').equals(String(id)).first();
      }
    } catch (e) {}

    const originalName = existing?.name || (typeof id === 'string' && isNaN(Number(id)) ? id : '');
    const remoteTargetId = existing?.remoteId || existing?.id || id;
    const mergedUpdates = {
      ...updates,
      originalName,
      updatedAt: Date.now(),
      school_id: targetSchoolId,
      schoolId: targetSchoolId
    };

    // 1. Immediate in-place optimistic Dexie update
    try {
      if (existing && existing.id) {
        await db.classes.update(existing.id, mergedUpdates);
      } else if (typeof id === 'number') {
        await db.classes.update(id, mergedUpdates);
      }
    } catch (e) {}

    // 2. Persist in-place to Backend API
    let serverUpdated = false;
    try {
      const qParams = new URLSearchParams();
      if (targetSchoolId) qParams.set('school_id', targetSchoolId);
      if (originalName) qParams.set('name', originalName);

      const res = await fetch(`/api/classes/${encodeURIComponent(String(remoteTargetId))}?${qParams.toString()}`, {
        method: 'PUT',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(mergedUpdates)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          serverUpdated = true;
          try {
            await reconcileClassesInDexie([json.data]);
          } catch (e) {}
          broadcastLocalMutation('classes', 'update', json.data);
          return json.data;
        }
      }
    } catch (e) {}

    // 3. Direct Supabase sync if Backend API failed
    if (!serverUpdated) {
      try {
        const dbPayload: any = {};
        if (updates.name !== undefined) dbPayload.name = updates.name;
        if (updates.level !== undefined) dbPayload.level = updates.level;
        if (updates.capacity !== undefined) dbPayload.capacity = updates.capacity;
        if (remoteTargetId && !isNaN(Number(remoteTargetId))) {
          await supabase.from('classes').update(dbPayload).eq('id', Number(remoteTargetId));
        } else if (originalName) {
          let q = supabase.from('classes').update(dbPayload).eq('name', originalName);
          if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
          await q;
        }
      } catch (e) {}
    }

    broadcastLocalMutation('classes', 'update', { id: remoteTargetId, ...mergedUpdates });
    return true;
  },

  delete: async (id: number | string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // Look up existing class BEFORE deleting from Dexie so we capture name and remoteId
    let existing: any = null;
    try {
      if (typeof id === 'number') {
        existing = await db.classes.get(id);
      } else if (!isNaN(Number(id))) {
        existing = await db.classes.get(Number(id));
      }
      if (!existing && typeof id === 'string') {
        existing = await db.classes.where('name').equals(id).first();
      }
    } catch (e) {}

    const className = existing?.name || (typeof id === 'string' && isNaN(Number(id)) ? id : '');
    const remoteTargetId = existing?.remoteId || existing?.id || id;

    // 1. Immediate local Dexie deletion
    try {
      if (existing?.id) {
        await db.classes.delete(existing.id);
      }
      if (typeof id === 'number') {
        await db.classes.delete(id);
      } else if (!isNaN(Number(id))) {
        await db.classes.delete(Number(id));
      }
      if (className) {
        await db.classes.where('name').equals(className).delete();
      }
    } catch (e) {}

    // 2. Backend API Deletion
    let serverDeleted = false;
    try {
      const qParams = new URLSearchParams();
      if (targetSchoolId) qParams.set('school_id', targetSchoolId);
      if (className) qParams.set('name', className);

      const res = await fetch(`/api/classes/${encodeURIComponent(String(remoteTargetId))}?${qParams.toString()}`, {
        method: 'DELETE',
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) serverDeleted = true;
    } catch (e) {}

    // 3. Direct Supabase Deletion fallback
    if (!serverDeleted) {
      try {
        if (remoteTargetId && !isNaN(Number(remoteTargetId))) {
          await supabase.from('classes').delete().eq('id', Number(remoteTargetId));
        }
        if (className) {
          let q = supabase.from('classes').delete().eq('name', className);
          if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
          await q;
        }
      } catch (e) {}
    }

    broadcastLocalMutation('classes', 'delete', { id: remoteTargetId, name: className });
    return true;
  }
};

// ==========================================
// 3. SUBJECTS API
// ==========================================
export const subjectsApi = {
  getAll: async (schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // 1. Try Backend API
    try {
      const res = await fetch(`/api/subjects?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          try {
            await reconcileSubjectsInDexie(data, true);
          } catch (e) {}
          return data;
        }
      }
    } catch (e) {}

    // 2. Try direct Supabase
    try {
      if (targetSchoolId) {
        const { data, error } = await supabase
          .from('subjects')
          .select('*')
          .eq("school_id", targetSchoolId);

        if (!error && Array.isArray(data)) {
          const parsed = data.map((sub: any) => {
            const rawApp = sub.applicableClasses ?? sub.applicable_classes;
            return {
              ...sub,
              applicableClasses: typeof rawApp === 'string' ? JSON.parse(rawApp || '[]') : (rawApp || [])
            };
          });
          try {
            await reconcileSubjectsInDexie(parsed, true);
          } catch (e) {}
          return parsed;
        }
      }
    } catch (e) {}

    // 3. Fallback to Local Dexie
    const local = await db.subjects.toArray();
    return targetSchoolId ? local.filter((s: any) => s.schoolId === targetSchoolId || s.school_id === targetSchoolId) : local;
  },

  create: async (subjectData: { name: string; code: string; applicableClasses?: string[] }, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const payload = {
      ...subjectData,
      applicableClasses: subjectData.applicableClasses || ['All'],
      school_id: targetSchoolId,
      schoolId: targetSchoolId,
      createdAt: Date.now()
    };
    
    // 1. Optimistic local Dexie entry
    const localId = await db.subjects.add(payload as any);
    let officialRecord: any = { ...payload, id: localId };
    let persistedRemotely = false;

    // 2. Persist to Backend API
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          officialRecord = json.data;
          persistedRemotely = true;
          try {
            if (officialRecord.id && Number(officialRecord.id) !== localId) {
              await db.subjects.delete(localId);
            }
            await reconcileSubjectsInDexie([officialRecord]);
          } catch (e) {}
        }
      }
    } catch (e) {}

    // 3. Direct Supabase sync only if Backend API did not persist
    if (!persistedRemotely) {
      try {
        const { data } = await supabase.from('subjects').insert([{
          name: payload.name,
          code: payload.code,
          applicable_classes: payload.applicableClasses,
          school_id: targetSchoolId
        }]).select().single();
        if (data) {
          officialRecord = data;
          try {
            if (officialRecord.id && Number(officialRecord.id) !== localId) {
              await db.subjects.delete(localId);
            }
            await reconcileSubjectsInDexie([officialRecord]);
          } catch (e) {}
        }
      } catch (e) {}
    }

    broadcastLocalMutation('subjects', 'create', officialRecord);
    return officialRecord;
  },

  update: async (id: number | string, updates: any, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // Look up existing subject BEFORE updating Dexie so we capture originalCode, originalName, and remoteId
    let existing: any = null;
    try {
      if (typeof id === 'number') {
        existing = await db.subjects.get(id);
      } else if (!isNaN(Number(id))) {
        existing = await db.subjects.get(Number(id));
      }
      if (!existing) {
        existing = await db.subjects.where('code').equals(String(id)).first() || await db.subjects.where('name').equals(String(id)).first();
      }
    } catch (e) {}

    const originalCode = existing?.code || updates.originalCode || '';
    const originalName = existing?.name || updates.originalName || '';
    const remoteTargetId = existing?.remoteId || existing?.id || id;
    const mergedUpdates = {
      ...updates,
      originalCode,
      originalName,
      updatedAt: Date.now(),
      school_id: targetSchoolId,
      schoolId: targetSchoolId
    };

    // 1. Immediate in-place optimistic Dexie update
    try {
      if (existing && existing.id) {
        await db.subjects.update(existing.id, mergedUpdates);
      } else if (typeof id === 'number') {
        await db.subjects.update(id, mergedUpdates);
      }
    } catch (e) {}

    // 2. Persist in-place to Backend API
    let serverUpdated = false;
    try {
      const qParams = new URLSearchParams();
      if (targetSchoolId) qParams.set('school_id', targetSchoolId);
      if (originalCode) qParams.set('code', originalCode);
      if (originalName) qParams.set('name', originalName);

      const res = await fetch(`/api/subjects/${encodeURIComponent(String(remoteTargetId))}?${qParams.toString()}`, {
        method: 'PUT',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(mergedUpdates)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          serverUpdated = true;
          try {
            await reconcileSubjectsInDexie([json.data]);
          } catch (e) {}
          broadcastLocalMutation('subjects', 'update', json.data);
          return json.data;
        }
      }
    } catch (e) {}

    // 3. Direct Supabase sync if Backend API failed
    if (!serverUpdated) {
      try {
        const snakePayload: any = {};
        if (updates.name !== undefined) snakePayload.name = updates.name;
        if (updates.code !== undefined) snakePayload.code = updates.code;
        if (updates.applicableClasses !== undefined) snakePayload.applicable_classes = updates.applicableClasses;
        if (remoteTargetId && !isNaN(Number(remoteTargetId))) {
          await supabase.from('subjects').update(snakePayload).eq('id', Number(remoteTargetId));
        } else if (originalCode) {
          let q = supabase.from('subjects').update(snakePayload).eq('code', originalCode);
          if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
          await q;
        }
      } catch (e) {}
    }

    broadcastLocalMutation('subjects', 'update', { id: remoteTargetId, ...mergedUpdates });
    return true;
  },

  delete: async (id: number | string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // Look up existing subject BEFORE deleting from Dexie so we capture code, name, and remoteId
    let existing: any = null;
    try {
      if (typeof id === 'number') {
        existing = await db.subjects.get(id);
      } else if (!isNaN(Number(id))) {
        existing = await db.subjects.get(Number(id));
      }
      if (!existing && typeof id === 'string') {
        existing = await db.subjects.where('code').equals(id).first() || await db.subjects.where('name').equals(id).first();
      }
    } catch (e) {}

    const subjectCode = existing?.code || '';
    const subjectName = existing?.name || '';
    const remoteTargetId = existing?.remoteId || existing?.id || id;

    // 1. Immediate local Dexie deletion
    try {
      if (existing?.id) {
        await db.subjects.delete(existing.id);
      }
      if (typeof id === 'number') {
        await db.subjects.delete(id);
      } else if (!isNaN(Number(id))) {
        await db.subjects.delete(Number(id));
      }
      if (subjectCode) {
        await db.subjects.where('code').equals(subjectCode).delete();
      }
      if (subjectName) {
        await db.subjects.where('name').equals(subjectName).delete();
      }
    } catch (e) {}

    // 2. Backend API Deletion
    let serverDeleted = false;
    try {
      const qParams = new URLSearchParams();
      if (targetSchoolId) qParams.set('school_id', targetSchoolId);
      if (subjectCode) qParams.set('code', subjectCode);
      if (subjectName) qParams.set('name', subjectName);

      const res = await fetch(`/api/subjects/${encodeURIComponent(String(remoteTargetId))}?${qParams.toString()}`, {
        method: 'DELETE',
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) serverDeleted = true;
    } catch (e) {}

    // 3. Direct Supabase Deletion
    if (!serverDeleted) {
      try {
        if (remoteTargetId && !isNaN(Number(remoteTargetId))) {
          await supabase.from('subjects').delete().eq('id', Number(remoteTargetId));
        }
        if (subjectCode) {
          let q = supabase.from('subjects').delete().eq('code', subjectCode);
          if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
          await q;
        }
      } catch (e) {}
    }

    broadcastLocalMutation('subjects', 'delete', { id: remoteTargetId, code: subjectCode, name: subjectName });
    return true;
  }
};

// ==========================================
// 4. TEACHERS & STAFF API
// ==========================================
export const teachersApi = {
  getAll: async (schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // 1. Try Backend API
    try {
      const res = await fetch(`/api/teachers?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          try {
            await reconcileTeachersInDexie(data, true);
          } catch (e) {}
          return data;
        }
      }
    } catch (e) {}

    // 2. Try direct Supabase
    try {
      if (targetSchoolId) {
        const { data, error } = await supabase
          .from('teachers')
          .select('*')
          .eq("school_id", targetSchoolId);

        if (!error && Array.isArray(data)) {
          const parsed = data.map((t: any) => {
            const rawAssigned = t.assignedClasses ?? t.assigned_classes;
            return {
              ...t,
              staffId: t.staffId || t.staff_id,
              firstName: t.firstName || t.first_name,
              lastName: t.lastName || t.last_name,
              assignedClasses: typeof rawAssigned === 'string' ? JSON.parse(rawAssigned || '[]') : (rawAssigned || []),
              subjects: typeof t.subjects === 'string' ? JSON.parse(t.subjects || '[]') : (t.subjects || [])
            };
          });
          try {
            await reconcileTeachersInDexie(parsed, true);
          } catch (e) {}
          return parsed;
        }
      }
    } catch (e) {}

    // 3. Fallback to Local Dexie
    const local = await db.teachers.toArray();
    return targetSchoolId ? local.filter((t: any) => t.schoolId === targetSchoolId || t.school_id === targetSchoolId) : local;
  },

  create: async (teacher: any, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const payload = {
      ...teacher,
      assignedClasses: teacher.assignedClasses || [],
      subjects: teacher.subjects || [],
      school_id: targetSchoolId,
      schoolId: targetSchoolId,
      createdAt: Date.now()
    };

    // 1. Optimistic local Dexie entry
    const localId = await db.teachers.add(payload as any);
    let officialRecord: any = { ...payload, id: localId };
    let persistedRemotely = false;

    // 2. Persist to Backend API
    try {
      const res = await fetch('/api/teachers', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          officialRecord = json.data;
          persistedRemotely = true;
          try {
            if (officialRecord.id && Number(officialRecord.id) !== localId) {
              await db.teachers.delete(localId);
            }
            await reconcileTeachersInDexie([officialRecord]);
          } catch (e) {}
        }
      }
    } catch (e) {}

    // 3. Direct Supabase sync only if Backend API did not persist
    if (!persistedRemotely) {
      try {
        const { data } = await supabase.from('teachers').insert([{
          staff_id: payload.staffId || payload.staff_id || `TEA-${Date.now().toString().slice(-4)}`,
          first_name: payload.firstName || payload.first_name || '',
          last_name: payload.lastName || payload.last_name || '',
          phone: payload.phone || '',
          email: payload.email || null,
          assigned_classes: payload.assignedClasses,
          subjects: payload.subjects,
          school_id: targetSchoolId
        }]).select().single();
        if (data) {
          officialRecord = data;
          try {
            if (officialRecord.id && Number(officialRecord.id) !== localId) {
              await db.teachers.delete(localId);
            }
            await reconcileTeachersInDexie([officialRecord]);
          } catch (e) {}
        }
      } catch (e) {}
    }

    broadcastLocalMutation('teachers', 'create', officialRecord);
    return officialRecord;
  },

  update: async (id: number | string, updates: any, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // Look up existing teacher BEFORE updating Dexie so we capture staffId and remoteId
    let existing: any = null;
    try {
      if (typeof id === 'number') {
        existing = await db.teachers.get(id);
      } else if (!isNaN(Number(id))) {
        existing = await db.teachers.get(Number(id));
      }
      if (!existing) {
        existing = await db.teachers.where('staffId').equals(String(id)).first();
      }
    } catch (e) {}

    const staffId = existing?.staffId || existing?.staff_id || updates.staffId || updates.staff_id || (typeof id === 'string' && isNaN(Number(id)) ? id : '');
    const remoteTargetId = existing?.remoteId || existing?.id || id;
    const mergedUpdates = {
      ...updates,
      staffId: staffId || updates.staffId,
      staff_id: staffId || updates.staff_id,
      updatedAt: Date.now(),
      school_id: targetSchoolId,
      schoolId: targetSchoolId
    };

    // 1. Immediate in-place optimistic Dexie update
    try {
      if (existing && existing.id) {
        await db.teachers.update(existing.id, mergedUpdates);
      } else if (typeof id === 'number') {
        await db.teachers.update(id, mergedUpdates);
      }
    } catch (e) {}

    // 2. Persist in-place to Backend API
    let serverUpdated = false;
    try {
      const qParams = new URLSearchParams();
      if (targetSchoolId) qParams.set('school_id', targetSchoolId);
      if (staffId) qParams.set('staff_id', staffId);

      const res = await fetch(`/api/teachers/${encodeURIComponent(String(remoteTargetId))}?${qParams.toString()}`, {
        method: 'PUT',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(mergedUpdates)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          serverUpdated = true;
          try {
            await reconcileTeachersInDexie([json.data]);
          } catch (e) {}
          broadcastLocalMutation('teachers', 'update', json.data);
          return json.data;
        }
      }
    } catch (e) {}

    // 3. Direct Supabase sync if Backend API failed
    if (!serverUpdated) {
      try {
        const snakePayload: any = {};
        if (updates.firstName !== undefined) snakePayload.first_name = updates.firstName;
        if (updates.lastName !== undefined) snakePayload.last_name = updates.lastName;
        if (updates.phone !== undefined) snakePayload.phone = updates.phone;
        if (updates.email !== undefined) snakePayload.email = updates.email;
        if (updates.assignedClasses !== undefined) snakePayload.assigned_classes = updates.assignedClasses;
        if (updates.subjects !== undefined) snakePayload.subjects = updates.subjects;

        if (remoteTargetId && !isNaN(Number(remoteTargetId))) {
          await supabase.from('teachers').update(snakePayload).eq('id', Number(remoteTargetId));
        } else if (staffId) {
          let q = supabase.from('teachers').update(snakePayload).eq('staff_id', staffId);
          if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
          await q;
        }
      } catch (e) {}
    }

    broadcastLocalMutation('teachers', 'update', { id: remoteTargetId, ...mergedUpdates });
    return true;
  },

  delete: async (id: number | string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // Look up existing teacher BEFORE deleting from Dexie so we capture staffId and remoteId
    let existing: any = null;
    try {
      if (typeof id === 'number') {
        existing = await db.teachers.get(id);
      } else if (!isNaN(Number(id))) {
        existing = await db.teachers.get(Number(id));
      }
      if (!existing && typeof id === 'string') {
        existing = await db.teachers.where('staffId').equals(id).first();
      }
    } catch (e) {}

    const staffId = existing?.staffId || existing?.staff_id || (typeof id === 'string' && isNaN(Number(id)) ? id : '');
    const remoteTargetId = existing?.remoteId || existing?.id || id;

    // 1. Immediate local Dexie deletion
    try {
      if (existing?.id) {
        await db.teachers.delete(existing.id);
      }
      if (typeof id === 'number') {
        await db.teachers.delete(id);
      } else if (!isNaN(Number(id))) {
        await db.teachers.delete(Number(id));
      }
      if (staffId) {
        await db.teachers.where('staffId').equals(staffId).delete();
      }
    } catch (e) {}

    // 2. Backend API Deletion
    let serverDeleted = false;
    try {
      const qParams = new URLSearchParams();
      if (targetSchoolId) qParams.set('school_id', targetSchoolId);
      if (staffId) qParams.set('staff_id', staffId);

      const res = await fetch(`/api/teachers/${encodeURIComponent(String(remoteTargetId))}?${qParams.toString()}`, {
        method: 'DELETE',
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) serverDeleted = true;
    } catch (e) {}

    // 3. Direct Supabase Deletion
    if (!serverDeleted) {
      try {
        if (remoteTargetId && !isNaN(Number(remoteTargetId))) {
          await supabase.from('teachers').delete().eq('id', Number(remoteTargetId));
        }
        if (staffId) {
          let q = supabase.from('teachers').delete().eq('staff_id', staffId);
          if (targetSchoolId) q = q.eq('school_id', targetSchoolId);
          await q;
        }
      } catch (e) {}
    }

    broadcastLocalMutation('teachers', 'delete', { id: remoteTargetId, staffId });
    return true;
  }
};

// ==========================================
// 5. TENANT ACADEMIC DATA SYNCHRONIZATION
// ==========================================
export const syncTenantAcademicData = async (targetSchoolId: string) => {
  if (!targetSchoolId) return false;
  try {
    const res = await fetch(`/api/academic/sync-tenant/${encodeURIComponent(targetSchoolId)}`);
    if (res.ok) {
      const { data } = await res.json();
      if (data) {
        // Hydrate local Dexie with tenant's records in-place and prune non-tenant rows
        if (Array.isArray(data.students)) await reconcileStudentsInDexie(data.students, true);
        if (Array.isArray(data.teachers)) await reconcileTeachersInDexie(data.teachers, true);
        if (Array.isArray(data.classes)) await reconcileClassesInDexie(data.classes, true);
        if (Array.isArray(data.subjects)) await reconcileSubjectsInDexie(data.subjects, true);
        if (Array.isArray(data.attendance)) await reconcileAttendanceInDexie(data.attendance);
        if (Array.isArray(data.results)) await reconcileResultsInDexie(data.results);
        return true;
      }
    }
  } catch (e) {
    console.warn('Notice hydrating tenant academic data:', e);
  }
  return false;
};

// ==========================================
// 4. ATTENDANCE API
// ==========================================
export const attendanceApi = {
  getByDate: async (date: string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('school_id', targetSchoolId)
        .eq('date', date);

      if (!error && data && data.length > 0) return data;
    } catch (e) {}
    return await db.attendance.where('date').equals(date).toArray();
  },

  recordAttendance: async (records: Array<{ studentId: string; date: string; status: 'Present' | 'Absent' | 'Late' | string; class?: string; reason?: string }>, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const recordsWithTenant: any[] = records.map(r => ({ ...r, school_id: targetSchoolId }));
    
    // Save to Dexie
    await db.attendance.bulkPut(recordsWithTenant as any);

    // Save to Backend API / Supabase
    try {
      await fetch(`/api/db/sync?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({ attendance: recordsWithTenant })
      });
    } catch (e) {}

    try {
      const snakeRecords = records.map(r => ({
        school_id: targetSchoolId,
        student_id: r.studentId || (r as any).student_id,
        date: r.date,
        status: r.status || 'Present',
        class: r.class || null,
        reason: r.reason || null
      }));
      await supabase.from('attendance').upsert(snakeRecords, { onConflict: 'school_id,student_id,date' });
    } catch (e) {}
    return true;
  }
};

// ==========================================
// 5. RESULTS & CONTINUOUS ASSESSMENT (EXERCISES, HOMEWORK, TESTS) API
// ==========================================
export const resultsApi = {
  getByClassAndTerm: async (className: string, term: string, subject?: string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // 1. Primary authoritative route: Backend Supabase endpoint (/api/results)
    try {
      const q = new URLSearchParams();
      if (targetSchoolId) q.set('school_id', targetSchoolId);
      if (className) q.set('class', className);
      if (term) q.set('term', term);
      if (subject) q.set('subject', subject);

      const res = await fetch(`/api/results?${q.toString()}`, {
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.results)) {
          await reconcileResultsInDexie(json.results);
          if (className && subject && term) {
            const colKey = `ca_columns_${className}_${subject}_${term}`;
            const scoreKey = `ca_scores_${className}_${subject}_${term}`;
            if (Array.isArray(json.caColumns) && json.caColumns.length > 0) {
              const exCol = await db.settings.where('key').equals(colKey).first();
              if (exCol?.id) await db.settings.update(exCol.id, { key: colKey, value: json.caColumns });
              else await db.settings.add({ key: colKey, value: json.caColumns });
            }
            if (json.caScores && typeof json.caScores === 'object' && Object.keys(json.caScores).length > 0) {
              const exSc = await db.settings.where('key').equals(scoreKey).first();
              if (exSc?.id) await db.settings.update(exSc.id, { key: scoreKey, value: json.caScores });
              else await db.settings.add({ key: scoreKey, value: json.caScores });
            }
          }
          return {
            results: json.results,
            caColumns: Array.isArray(json.caColumns) ? json.caColumns : undefined,
            caScores: json.caScores && typeof json.caScores === 'object' ? json.caScores : undefined
          };
        }
      }
    } catch (e) {
      console.warn('Notice querying /api/results from Supabase backend:', e);
    }

    // 2. Direct Supabase query fallback
    try {
      let query = supabase
        .from('results')
        .select('*')
        .eq('school_id', targetSchoolId)
        .eq('class', className)
        .eq('term', term);

      if (subject) {
        query = query.eq('subject', subject);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        await reconcileResultsInDexie(data);
        return { results: data };
      }
    } catch (e) {}

    let localResults = await db.results.where({ class: className, term }).toArray();
    if (subject) {
      localResults = localResults.filter(r => r.subject === subject);
    }
    return { results: localResults };
  },

  getByStudentAndTerm: async (studentId: string, term: string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    try {
      const q = new URLSearchParams();
      if (targetSchoolId) q.set('school_id', targetSchoolId);
      if (studentId) q.set('student_id', studentId);
      if (term) q.set('term', term);

      const res = await fetch(`/api/results?${q.toString()}`, {
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.results)) {
          await reconcileResultsInDexie(json.results);
          return json.results;
        }
      }
    } catch (e) {}

    try {
      const { data, error } = await supabase
        .from('results')
        .select('*')
        .eq('school_id', targetSchoolId)
        .eq('student_id', studentId)
        .eq('term', term);
      if (!error && Array.isArray(data) && data.length > 0) {
        await reconcileResultsInDexie(data);
      }
    } catch (e) {}

    return await db.results.where({ studentId, term }).toArray();
  },

  saveContinuousAssessment: async (
    payload: {
      class: string;
      subject: string;
      term: string;
      academicYear?: string;
      columns: any[];
      exerciseScores: Record<string, Record<string, number>>;
      scores?: Record<string, { class: number; exam: number }>;
    },
    schoolId?: string
  ) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // 1. Save locally in Dexie settings for instant UI reactivity
    try {
      const colKey = `ca_columns_${payload.class}_${payload.subject}_${payload.term}`;
      const scoreKey = `ca_scores_${payload.class}_${payload.subject}_${payload.term}`;
      const existingCol = await db.settings.where('key').equals(colKey).first();
      if (existingCol?.id) {
        await db.settings.update(existingCol.id, { key: colKey, value: payload.columns });
      } else {
        await db.settings.add({ key: colKey, value: payload.columns });
      }
      const existingSc = await db.settings.where('key').equals(scoreKey).first();
      if (existingSc?.id) {
        await db.settings.update(existingSc.id, { key: scoreKey, value: payload.exerciseScores });
      } else {
        await db.settings.add({ key: scoreKey, value: payload.exerciseScores });
      }
    } catch (e) {}

    // 2. Sync to Supabase via dedicated /api/results/ca endpoint
    let serverSynced = false;
    try {
      const res = await fetch('/api/results/ca', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({
          ...payload,
          school_id: targetSchoolId,
          schoolId: targetSchoolId
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          serverSynced = true;
          if (Array.isArray(json.results) && json.results.length > 0) {
            await reconcileResultsInDexie(json.results);
          }
          broadcastLocalMutation('results', 'update', json);
          return json;
        }
      }
    } catch (e) {
      console.warn('Notice syncing continuous assessment to /api/results/ca:', e);
    }

    // 3. Direct Supabase fallback if server route was unreachable
    if (!serverSynced && targetSchoolId) {
      try {
        const { data: existingSettings } = await supabase
          .from('school_settings')
          .select('*')
          .eq('school_id', targetSchoolId)
          .limit(1)
          .maybeSingle();
        const prevStreams = (existingSettings?.streams && typeof existingSettings.streams === 'object' && !Array.isArray(existingSettings.streams))
          ? existingSettings.streams
          : {};
        const prevCa = (prevStreams as any).continuous_assessment || {};
        const caKey = `${payload.class}::${payload.subject}::${payload.term}`;
        const rawMax = (payload.columns || []).reduce((acc: number, c: any) => acc + (Number(c?.maxScore) || 0), 0);
        const studentScores: Record<string, any> = {};
        for (const [stuId, map] of Object.entries(payload.exerciseScores || {})) {
          let rawObtained = 0;
          for (const v of Object.values(map || {})) {
            if (v !== undefined && v !== null && !isNaN(Number(v))) rawObtained += Number(v);
          }
          studentScores[stuId] = {
            scores: map,
            rawCaScore: rawObtained,
            rawCaMax: rawMax,
            scaledClassScore: rawMax > 0 ? Math.min(30, Math.max(0, Math.round((rawObtained / rawMax) * 30))) : 0
          };
        }
        await supabase.from('school_settings').upsert([{
          school_id: targetSchoolId,
          grade_boundaries: existingSettings?.grade_boundaries || [],
          terms: existingSettings?.terms || [],
          streams: {
            ...prevStreams,
            continuous_assessment: {
              ...prevCa,
              [caKey]: {
                className: payload.class,
                subject: payload.subject,
                term: payload.term,
                columns: payload.columns,
                studentScores,
                updatedAt: Date.now()
              }
            }
          },
          updated_at: Date.now()
        }], { onConflict: 'school_id' });
      } catch (e) {}
    }

    return { success: true, syncedAt: Date.now() };
  },

  recordScores: async (
    scores: any[],
    schoolId?: string,
    caMeta?: {
      className: string;
      subject: string;
      term: string;
      columns: any[];
      exerciseScores: Record<string, Record<string, number>>;
    }
  ) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const recordsWithTenant = scores.map(s => ({
      ...s,
      school_id: targetSchoolId,
      schoolId: targetSchoolId
    }));

    await reconcileResultsInDexie(recordsWithTenant);

    // 1. Primary authoritative route: POST /api/results (persists both public.results and public.school_settings in Supabase)
    let serverSaved = false;
    try {
      const sample = scores[0] || {};
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({
          school_id: targetSchoolId,
          schoolId: targetSchoolId,
          class: caMeta?.className || sample.class,
          subject: caMeta?.subject || sample.subject,
          term: caMeta?.term || sample.term,
          results: recordsWithTenant,
          caMeta
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          serverSaved = true;
          if (Array.isArray(json.results) && json.results.length > 0) {
            await reconcileResultsInDexie(json.results);
          }
          broadcastLocalMutation('results', 'bulk-save', json);
        }
      }
    } catch (e) {
      console.warn('Notice calling POST /api/results:', e);
    }

    // 2. Fallback direct Supabase upsert if needed
    if (!serverSaved && targetSchoolId) {
      try {
        const snakeScores = scores.map(s => ({
          school_id: targetSchoolId,
          student_id: s.studentId || s.student_id,
          subject: s.subject,
          term: s.term,
          academic_year: s.academicYear || s.academic_year || '2026/2027',
          class: s.class,
          class_score: Number(s.classScore ?? s.class_score ?? 0),
          exam_score: Number(s.examScore ?? s.exam_score ?? 0),
          total_score: Number(s.totalScore ?? s.total_score ?? 0),
          grade: s.grade || 'F9',
          remarks: s.remarks || ''
        }));
        await supabase.from('results').upsert(snakeScores, { onConflict: 'school_id,student_id,subject,term,academic_year' });
      } catch (e) {}
    }

    return true;
  },

  syncLocalResults: async (
    payload: {
      class?: string;
      subject?: string;
      term?: string;
      results?: any[];
      caMeta?: {
        className: string;
        subject: string;
        term: string;
        columns: any[];
        exerciseScores: Record<string, Record<string, number>>;
      };
    },
    schoolId?: string
  ) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    try {
      const res = await fetch('/api/results/sync', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({
          ...payload,
          school_id: targetSchoolId,
          schoolId: targetSchoolId
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.results)) {
          await reconcileResultsInDexie(json.results);
          return json;
        }
      }
    } catch (e) {}
    return null;
  }
};

// ==========================================
// 6. PROMOTIONS & ACADEMIC TRANSITIONS API
// ==========================================
export const promotionsApi = {
  getAll: async (schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    try {
      if (targetSchoolId) {
        const { data, error } = await supabase
          .from('promotion_history')
          .select('*')
          .eq("school_id", targetSchoolId)
          .order('timestamp', { ascending: false });

        if (!error && data && data.length > 0) return data;
      }
    } catch (e) {}

    return await db.promotionHistory.toArray();
  },

  recordPromotion: async (record: any, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const payload = { ...record, school_id: targetSchoolId, schoolId: targetSchoolId };
    
    // 1. Add to Dexie
    const localId = await db.promotionHistory.add(payload);

    // 2. Persist to Backend & Supabase
    try {
      await fetch(`/api/db/sync?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({ promotionHistory: [payload] })
      });
    } catch (e) {}

    try {
      await supabase.from('promotion_history').insert([{
        school_id: targetSchoolId,
        student_id: record.studentId || record.student_id,
        student_name: record.studentName || record.student_name,
        from_class: record.fromClass || record.from_class,
        to_class: record.toClass || record.to_class,
        academic_year: record.academicYear || record.academic_year,
        timestamp: record.timestamp || Date.now()
      }]);
    } catch (e) {}

    return localId;
  },

  revertPromotion: async (id: number, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    
    // 1. Delete from Dexie
    await db.promotionHistory.delete(id);

    // 2. Delete from Supabase
    try {
      await supabase.from('promotion_history').delete().eq('id', id);
    } catch (e) {}

    return true;
  }
};

// ==========================================
// 7. FEES & FINANCIAL TRANSACTIONS API (SUPABASE)
// ==========================================
export const feesApi = {
  getAll: async (schoolId?: string) => {
    return await feesApi.getTransactions(undefined, schoolId);
  },

  getTransactions: async (studentId?: string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    // 1. Primary Server Endpoint (/api/fees/transactions)
    try {
      const params = new URLSearchParams();
      if (targetSchoolId) params.set('school_id', targetSchoolId);
      if (studentId) params.set('student_id', studentId);
      const res = await fetch(`/api/fees/transactions?${params.toString()}`, {
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.transactions)) {
          const normalized = json.transactions.map((tx: any) => normalizeFeeTransactionRecord(tx));
          await reconcileFeeTransactionsInDexie(normalized, !studentId);
          return normalized;
        }
      }
    } catch (e) {
      console.warn('Notice fetching /api/fees/transactions:', e);
    }

    // 2. Direct Supabase query fallback
    try {
      if (targetSchoolId) {
        let q = supabase.from('fee_transactions').select('*').eq('school_id', targetSchoolId);
        if (studentId) q = q.eq('student_id', studentId);
        const { data, error } = await q.order('date', { ascending: false });
        if (!error && Array.isArray(data)) {
          const normalized = data.map((tx: any) => normalizeFeeTransactionRecord(tx));
          await reconcileFeeTransactionsInDexie(normalized, false);
          return normalized;
        }
      }
    } catch (e) {}

    // 3. Local Dexie fallback
    const localTx = await db.feeTransactions.toArray();
    const filtered = localTx
      .map(tx => normalizeFeeTransactionRecord(tx))
      .filter(tx => {
        if (targetSchoolId && tx.schoolId && tx.schoolId !== targetSchoolId) return false;
        if (studentId && String(tx.studentId).toLowerCase() !== String(studentId).toLowerCase()) return false;
        return true;
      })
      .sort((a, b) => (b.date || 0) - (a.date || 0));
    return filtered;
  },

  recordPayment: async (
    paymentData: {
      studentId: string | number;
      studentCode?: string;
      studentName?: string;
      className?: string;
      studentNumericId?: number;
      amount: number;
      receiptNumber?: string;
      feeType?: string;
      allocationType?: string;
      paymentMethod?: string;
      channelLabel?: string;
      paymentChannelLabel?: string;
      transactionReference?: string;
      receivedBy?: string;
      recipientPhone?: string;
      guardianPhone?: string;
      guardianName?: string;
      academicYear?: string;
      term?: string;
      description?: string;
      feePaidBreakdown?: Record<string, number>;
      feeBreakdown?: Record<string, number>;
      totalFees?: number;
      newFeesPaid?: number;
      date?: number;
    },
    schoolId?: string
  ) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const amount = Number(paymentData.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    // Resolve student from local Dexie
    const studentCodeToLookup = paymentData.studentCode || String(paymentData.studentId);
    let student = await db.students.where('studentId').equals(studentCodeToLookup).first();
    if (!student && typeof paymentData.studentId === 'number') {
      student = await db.students.get(paymentData.studentId);
    }
    if (!student && paymentData.studentNumericId != null) {
      student = await db.students.get(Number(paymentData.studentNumericId));
    }

    const now = paymentData.date || Date.now();
    const receiptNumber = String(
      paymentData.receiptNumber || `RCP-${Math.floor(100000 + Math.random() * 900000)}`
    ).trim();

    const currentFeesPaid = Number(student?.feesPaid ?? 0);
    const totalFees = Number(paymentData.totalFees ?? student?.totalFees ?? 0);
    const newFeesPaid = paymentData.newFeesPaid !== undefined
      ? Number(paymentData.newFeesPaid)
      : currentFeesPaid + amount;

    const currentBreakdown = paymentData.feeBreakdown || student?.feeBreakdown || (totalFees > 0 ? { tuition: totalFees } : {});
    let updatedPaidBreakdown = paymentData.feePaidBreakdown;
    if (!updatedPaidBreakdown) {
      const basePaid: Record<string, number> = { ...(student?.feePaidBreakdown || {}) };
      if (Object.keys(basePaid).length === 0 && currentFeesPaid > 0) {
        basePaid.tuition = currentFeesPaid;
      }
      if (paymentData.allocationType && paymentData.allocationType !== 'automatic') {
        basePaid[paymentData.allocationType] = (basePaid[paymentData.allocationType] || 0) + amount;
      } else {
        let remaining = amount;
        const order = Array.from(new Set([...FEE_TYPES.map(f => f.id), ...Object.keys(currentBreakdown)]));
        for (const fid of order) {
          if (remaining <= 0) break;
          const billed = Number(currentBreakdown[fid] ?? (fid === 'tuition' ? totalFees : 0));
          const paid = Number(basePaid[fid] ?? 0);
          const out = Math.max(0, billed - paid);
          if (out > 0) {
            const alloc = Math.min(remaining, out);
            basePaid[fid] = paid + alloc;
            remaining -= alloc;
          }
        }
        if (remaining > 0) {
          basePaid.tuition = (basePaid.tuition || 0) + remaining;
        }
      }
      updatedPaidBreakdown = basePaid;
    }

    const rawMethod = paymentData.paymentMethod || paymentData.paymentChannelLabel || paymentData.channelLabel || 'Cash';
    const resolvedChannelLabel = paymentData.paymentChannelLabel || paymentData.channelLabel || rawMethod;
    const resolvedPhone = paymentData.guardianPhone || paymentData.recipientPhone || student?.guardianPhone || undefined;
    const normTx = normalizeFeeTransactionRecord({
      schoolId: targetSchoolId,
      school_id: targetSchoolId,
      receiptNumber,
      studentId: student?.studentId || paymentData.studentCode || String(paymentData.studentId),
      studentCode: student?.studentId || paymentData.studentCode || undefined,
      studentName: student ? `${student.firstName} ${student.lastName}`.trim() : paymentData.studentName,
      className: student?.class || paymentData.className,
      feeType: paymentData.feeType || (paymentData.allocationType && paymentData.allocationType !== 'automatic' ? paymentData.allocationType.toUpperCase() : 'Automatic Allocation'),
      amount,
      paymentMethod: rawMethod,
      channelLabel: resolvedChannelLabel,
      paymentChannelLabel: resolvedChannelLabel,
      transactionReference: paymentData.transactionReference || receiptNumber,
      receivedBy: paymentData.receivedBy || 'Bursary Office',
      recipientPhone: resolvedPhone,
      guardianPhone: resolvedPhone,
      academicYear: paymentData.academicYear,
      term: paymentData.term,
      allocationBreakdown: updatedPaidBreakdown,
      date: now
    });

    // 1. Optimistic Local Dexie Updates (students, feeTransactions, smsLogs)
    if (student && student.id) {
      await db.students.update(student.id, {
        feesPaid: newFeesPaid,
        feePaidBreakdown: updatedPaidBreakdown
      });
    }
    await reconcileFeeTransactionsInDexie([normTx], false);

    const studentFullName = student ? `${student.firstName} ${student.lastName}`.trim() : String(paymentData.studentName || paymentData.studentId);
    const outstandingBalance = Math.max(0, totalFees - newFeesPaid);
    const channelLabel = normTx.channelLabel || normTx.paymentMethod;
    try {
      await db.smsLogs.add({
        recipientPhone: normTx.recipientPhone || student?.guardianPhone || '0240000000',
        recipientName: String(student?.guardianName || paymentData.guardianName || studentFullName),
        recipientType: 'Parent',
        message: `School Fees Payment Alert: GHS ${amount.toFixed(2)} received via ${channelLabel} for ${studentFullName}. Ref: ${normTx.receiptNumber}. New Outstanding Balance: GHS ${outstandingBalance.toFixed(2)}. Thank you!`,
        type: 'Fee Reminder',
        status: 'Sent',
        createdAt: now
      });
    } catch {}

    const apiPayload = {
      schoolId: targetSchoolId,
      school_id: targetSchoolId,
      studentId: student?.studentId || paymentData.studentId,
      studentNumericId: student?.remoteId ?? student?.id ?? paymentData.studentNumericId,
      studentFirstName: student?.firstName,
      studentLastName: student?.lastName,
      className: student?.class,
      amount,
      newFeesPaid,
      totalFees,
      feeBreakdown: currentBreakdown,
      feePaidBreakdown: updatedPaidBreakdown,
      receiptNumber: normTx.receiptNumber,
      feeType: normTx.feeType,
      paymentMethod: normTx.paymentMethod,
      channelLabel,
      transactionReference: normTx.transactionReference,
      receivedBy: normTx.receivedBy,
      recipientPhone: normTx.recipientPhone,
      date: now
    };

    // 2. Authoritative Server Endpoint (POST /api/fees/pay)
    let syncedOnServer = false;
    try {
      const res = await fetch('/api/fees/pay', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(apiPayload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          syncedOnServer = true;
          if (json.student) {
            await reconcileStudentsInDexie([normalizeStudentRecord(json.student)], false);
          }
          if (json.transaction) {
            const serverTx = normalizeFeeTransactionRecord(json.transaction);
            await reconcileFeeTransactionsInDexie([serverTx], false);
            broadcastLocalMutation('feeTransactions', 'create', serverTx);
            broadcastLocalMutation('students', 'update', json.student);
            return {
              success: true,
              synced: true,
              queuedOffline: false,
              receiptNumber: serverTx.receiptNumber,
              transaction: serverTx,
              student: json.student ? normalizeStudentRecord(json.student) : student
            };
          }
        }
      }
    } catch (e) {
      console.warn('Notice calling POST /api/fees/pay:', e);
    }

    // 3. Fallback Direct Supabase + Offline Queue
    if (!syncedOnServer) {
      try {
        if (targetSchoolId) {
          await supabase
            .from('students')
            .update({
              fees_paid: newFeesPaid,
              fee_paid_breakdown: updatedPaidBreakdown,
              updated_at: now
            })
            .eq('school_id', targetSchoolId)
            .eq('student_id', apiPayload.studentId);

          await supabase
            .from('fee_transactions')
            .upsert([{
              school_id: targetSchoolId,
              receipt_number: normTx.receiptNumber,
              student_id: apiPayload.studentId,
              fee_type: normTx.feeType,
              amount,
              payment_method: normTx.paymentMethod,
              transaction_reference: normTx.transactionReference,
              received_by: normTx.receivedBy,
              notes: normTx.notes,
              date: now
            }], { onConflict: 'school_id,receipt_number' });
        }
      } catch {}

      queueOfflineWrite('fee_payment', 'insert', apiPayload);
    }

    broadcastLocalMutation('feeTransactions', 'create', normTx);
    return {
      success: true,
      synced: syncedOnServer,
      queuedOffline: !syncedOnServer,
      receiptNumber: normTx.receiptNumber,
      transaction: normTx,
      student
    };
  },

  batchBill: async (
    payload: {
      targetClass: string;
      mode?: 'replace' | 'merge';
      feeBreakdown?: Record<string, number>;
      feeStructureToApply?: Record<string, number>;
      academicYear?: string;
      term?: string;
    },
    schoolId?: string
  ) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const mode = payload.mode === 'merge' ? 'merge' : 'replace';
    const rawStructure = payload.feeBreakdown || payload.feeStructureToApply || {};
    const cleanBreakdown: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawStructure)) {
      const n = Math.max(0, Number(v) || 0);
      if (n > 0) cleanBreakdown[k] = n;
    }

    // 1. Optimistic Local Dexie Update
    const allLocal = await db.students.toArray();
    const isAllClasses = !payload.targetClass || payload.targetClass === 'All' || payload.targetClass === 'ALL';
    const matchingLocal = allLocal.filter(s => {
      if (targetSchoolId && (s as any).school_id && (s as any).school_id !== targetSchoolId) return false;
      if (!isAllClasses && (s.class || '').trim().toLowerCase() !== payload.targetClass.trim().toLowerCase()) return false;
      return true;
    });

    for (const stu of matchingLocal) {
      if (!stu.id) continue;
      const nextBreakdown = mode === 'merge'
        ? { ...(stu.feeBreakdown || {}), ...cleanBreakdown }
        : { ...cleanBreakdown };
      const nextTotal = Object.values(nextBreakdown).reduce((acc, val) => acc + (Number(val) || 0), 0);
      await db.students.update(stu.id, {
        feeBreakdown: nextBreakdown,
        totalFees: nextTotal
      });
    }

    const reqBody = {
      schoolId: targetSchoolId,
      school_id: targetSchoolId,
      targetClass: isAllClasses ? 'All' : payload.targetClass,
      mode,
      feeBreakdown: cleanBreakdown,
      academicYear: payload.academicYear,
      term: payload.term
    };

    // 2. Authoritative Server Endpoint (POST /api/fees/batch-bill)
    try {
      const res = await fetch('/api/fees/batch-bill', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify(reqBody)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.students)) {
          await reconcileStudentsInDexie(json.students.map((s: any) => normalizeStudentRecord(s)), false);
          broadcastLocalMutation('students', 'batch_bill', json.students);
          return {
            success: true,
            queuedOffline: false,
            updatedCount: json.updatedCount ?? json.students.length,
            students: json.students
          };
        }
      }
    } catch (e) {
      console.warn('Notice calling POST /api/fees/batch-bill:', e);
    }

    queueOfflineWrite('fee_batch_bill', 'update', reqBody);
    broadcastLocalMutation('students', 'batch_bill', matchingLocal);
    return {
      success: true,
      queuedOffline: true,
      updatedCount: matchingLocal.length,
      students: matchingLocal
    };
  },

  getStructures: async (schoolId?: string): Promise<{ feeStructures: any[]; invoices: any[] }> => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    try {
      const params = new URLSearchParams();
      if (targetSchoolId) params.set('school_id', targetSchoolId);
      const res = await fetch(`/api/fees/structures?${params.toString()}`, {
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return {
            feeStructures: Array.isArray(json.feeStructures) ? json.feeStructures : [],
            invoices: Array.isArray(json.invoices) ? json.invoices : []
          };
        }
      }
    } catch (e) {
      console.warn('Notice fetching /api/fees/structures:', e);
    }

    try {
      if (targetSchoolId) {
        const [fsRes, invRes] = await Promise.all([
          supabase.from('fee_structures').select('*').eq('school_id', targetSchoolId).order('created_at', { ascending: false }),
          supabase.from('invoices').select('*').eq('school_id', targetSchoolId).order('created_at', { ascending: false })
        ]);
        return {
          feeStructures: Array.isArray(fsRes.data) ? fsRes.data : [],
          invoices: Array.isArray(invRes.data) ? invRes.data : []
        };
      }
    } catch {}

    return { feeStructures: [], invoices: [] };
  },

  saveStructure: async (
    payload: {
      name?: string;
      className?: string;
      term?: string;
      academicYear?: string;
      items: Array<{ id: string; label: string; amount?: number; defaultAmount?: number }>;
    },
    schoolId?: string
  ) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const normalizedItems = (payload.items || []).map(item => ({
      id: String(item.id || item.label || 'fee').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      label: String(item.label || item.id || 'Fee Component').trim(),
      amount: Math.max(0, Number(item.amount ?? item.defaultAmount ?? 0) || 0)
    }));
    const total = normalizedItems.reduce((acc, i) => acc + i.amount, 0);
    const className = payload.className || 'All';
    const term = payload.term || 'Term 1';
    const academicYear = payload.academicYear || '2025/2026';
    const name = payload.name || `${className === 'All' ? 'All Classes' : className} - ${term} (${academicYear})`;

    try {
      const res = await fetch('/api/fees/structures', {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({
          schoolId: targetSchoolId,
          school_id: targetSchoolId,
          name,
          className,
          term,
          academicYear,
          items: normalizedItems,
          total
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return {
            success: true,
            feeStructure: json.feeStructure,
            feeStructures: Array.isArray(json.feeStructures) ? json.feeStructures : []
          };
        }
      }
    } catch (e) {
      console.warn('Notice calling POST /api/fees/structures:', e);
    }

    if (targetSchoolId) {
      try {
        const { data: inserted } = await supabase
          .from('fee_structures')
          .insert([{
            school_id: targetSchoolId,
            name,
            class_name: className,
            term,
            academic_year: academicYear,
            items: normalizedItems,
            total,
            created_at: Date.now()
          }])
          .select()
          .maybeSingle();
        return {
          success: true,
          feeStructure: inserted,
          feeStructures: inserted ? [inserted] : []
        };
      } catch {}
    }

    return { success: false, feeStructure: null, feeStructures: [] };
  },

  deleteStructure: async (id: number, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    try {
      const res = await fetch(`/api/fees/structures/${id}`, {
        method: 'DELETE',
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return {
            success: true,
            feeStructures: Array.isArray(json.feeStructures) ? json.feeStructures : []
          };
        }
      }
    } catch (e) {
      console.warn('Notice calling DELETE /api/fees/structures:', e);
    }

    if (targetSchoolId) {
      try {
        await supabase.from('fee_structures').delete().eq('school_id', targetSchoolId).eq('id', id);
      } catch {}
    }
    return { success: true, feeStructures: [] };
  },

  saveStudentFeeBreakdown: async (
    studentIdOrNumId: number | string,
    feeBreakdown: Record<string, number>,
    schoolId?: string,
    _studentCode?: string
  ) => {
    return await feesApi.updateStudentFeeBreakdown(studentIdOrNumId, feeBreakdown, schoolId);
  },

  updateStudentFeeBreakdown: async (
    studentIdOrNumId: number | string,
    feeBreakdown: Record<string, number>,
    schoolId?: string
  ) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const cleanBreakdown: Record<string, number> = {};
    for (const [k, v] of Object.entries(feeBreakdown || {})) {
      const n = Math.max(0, Number(v) || 0);
      if (n > 0) cleanBreakdown[k] = n;
    }
    const totalFees = Object.values(cleanBreakdown).reduce((acc, val) => acc + (Number(val) || 0), 0);
    return await studentsApi.update(
      studentIdOrNumId,
      {
        feeBreakdown: cleanBreakdown,
        totalFees
      },
      targetSchoolId || undefined
    );
  }
};

// ==========================================
// 7. MULTI-TENANT SCHOOLS DIRECTORY API
// ==========================================
export const schoolsApi = {
  getAll: async () => {
    try {
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tenants)) {
          return data.tenants;
        }
      }
    } catch (e) {}

    try {
      const { data, error } = await supabase.from('schools').select('*');
      if (!error && data) return data;
    } catch (e) {}

    return [
      {
        id: 'fca16e63-4259-4de7-aae1-8b4432ea0ea3',
        name: 'School Sphere Academy',
        slug: 'school-sphere-academy',
        status: 'active',
        theme: 'indigo'
      }
    ];
  },

  getCurrent: getCurrentSchoolId
};

export { getCurrentSchoolId };

// ==========================================
// 8. LICENSE VERIFICATION & STATUS API
// ==========================================
export const licenseApi = {
  getStatus: async () => {
    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return { active: true, activeModules: [] };
    }

    try {
      const { data } = await supabase
        .from('school_licenses')
        .select('*')
        .eq('school_id', schoolId)
        .or('active_status.eq.active,status.eq.active')
        .maybeSingle();

      if (data) {
        // Returns activeModules specific to that school's license tier
        return {
          active: true,
          tier: data.tier || 'enterprise',
          activeModules: data.active_modules || data.activeModules || [] // Per-school features
        };
      }
    } catch (e) {
      console.warn('Notice loading school license from Supabase:', e);
    }

    try {
      const res = await fetch('/api/license/status');
      if (res.ok) {
        return await res.json();
      }
    } catch (e: any) {}

    return {
      active: true,
      activeModules: [
        'students', 'academic', 'timetable', 'attendance',
        'results', 'exam_analysis', 'reports', 'fees',
        'siren', 'evoting', 'inventory'
      ]
    };
  },

  validate: async (licenseKey: string) => {
    try {
      const res = await fetch('/api/license/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseKey })
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
};


// ==========================================
// 9. USERS & AUTHENTICATION API
// ==========================================
export const usersApi = {
  getAll: async (schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());

    const normalizeUserItem = (u: any, canonicalSchoolId?: string | null) => {
      const rawUsername = String(u?.username || '').trim().toLowerCase().replace(/^@+/, '');
      const plainUsername = u?.baseUsername || (
        rawUsername.includes('@') && !/\.(com|org|net|edu|gh|xyz|io|app|ac|co|gov)$/i.test(rawUsername.split('@')[1] || '')
          ? rawUsername.split('@')[0]
          : rawUsername
      );
      const effectiveSchool = u?.school_id || u?.schoolId || canonicalSchoolId || targetSchoolId;
      const linkedProfile = u?.linkedProfile || u?.linked_profile || null;
      return {
        ...u,
        id: u?.id,
        username: plainUsername,
        baseUsername: plainUsername,
        scopedUsername: u?.scopedUsername || rawUsername,
        fullName: u?.fullName || u?.full_name || plainUsername,
        full_name: u?.full_name || u?.fullName || plainUsername,
        email: u?.email || '',
        phone: u?.phone || '',
        role: u?.role || 'teacher',
        status: u?.status || 'active',
        schoolId: effectiveSchool,
        school_id: effectiveSchool,
        schoolName: u?.schoolName || u?.school_name || undefined,
        staffId: u?.staffId || u?.staff_id || linkedProfile?.staffId || undefined,
        studentId: u?.studentId || u?.student_id || linkedProfile?.studentId || undefined,
        class: u?.class || linkedProfile?.class || undefined,
        assignedClasses: u?.assignedClasses || u?.assigned_classes || linkedProfile?.assignedClasses || undefined,
        subjects: u?.subjects || linkedProfile?.subjects || undefined,
        linkedProfile,
        createdAt: Number(u?.createdAt || u?.created_at || Date.now()),
        lastLogin: u?.lastLogin || u?.last_login || null
      };
    };

    // 1. Primary authoritative route: Server multi-tenant Supabase endpoint (/api/users)
    try {
      const q = targetSchoolId ? `?school_id=${encodeURIComponent(targetSchoolId)}` : '';
      const res = await fetch(`/api/users${q}`, {
        headers: getApiHeaders(targetSchoolId || undefined)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          const resolvedSchoolId = data.schoolId || targetSchoolId;
          return data.users
            .filter((u: any) => {
              const r = String(u?.role || '').toLowerCase();
              return r !== 'creator' && r !== 'super_admin';
            })
            .map((u: any) => normalizeUserItem(u, resolvedSchoolId));
        }
      }
    } catch (e) {
      console.warn('Notice fetching /api/users:', e);
    }

    // 2. Secondary direct Supabase query if user has an active Supabase Auth session
    try {
      let query = supabase
        .from('users')
        .select('*')
        .neq('role', 'creator')
        .neq('role', 'super_admin')
        .order('created_at', { ascending: false });

      if (targetSchoolId) {
        query = query.eq('school_id', targetSchoolId);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data
          .filter(u => {
            const r = String(u?.role || '').toLowerCase();
            return r !== 'creator' && r !== 'super_admin';
          })
          .map(u => normalizeUserItem(u, targetSchoolId));
      }
    } catch {}

    return [];
  },

  create: async (userData: any, schoolId?: string) => {
    const targetSchoolId = schoolId || userData.school_id || userData.schoolId || (await getCurrentSchoolId());
    const safeRole = (userData.role === 'creator' || userData.role === 'super_admin') ? 'admin' : (userData.role || 'teacher');
    const rawPassword = userData.password || userData.passwordHash || userData.password_hash || '';
    const cleanUsername = String(userData.username || '').trim().toLowerCase().replace(/^@+/, '');

    const payload = {
      ...userData,
      username: cleanUsername,
      password: rawPassword,
      full_name: userData.fullName || userData.full_name || cleanUsername,
      fullName: userData.fullName || userData.full_name || cleanUsername,
      email: userData.email || null,
      phone: userData.phone || null,
      role: safeRole,
      status: userData.status || 'active',
      school_id: targetSchoolId,
      schoolId: targetSchoolId
    };

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: getApiHeaders(targetSchoolId || undefined),
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false || !data.user?.id) {
      throw new Error(data.error || `Failed to create user account in Supabase (HTTP ${res.status})`);
    }

    const serverUser = data.user;
    const linkedProfile = data.linkedProfile || serverUser.linkedProfile || null;
    const canonicalSchoolId = serverUser.school_id || serverUser.schoolId || targetSchoolId;

    return {
      ...serverUser,
      id: serverUser.id,
      username: serverUser.username || cleanUsername,
      fullName: serverUser.full_name || serverUser.fullName || payload.full_name,
      full_name: serverUser.full_name || serverUser.fullName || payload.full_name,
      email: serverUser.email || payload.email || '',
      phone: serverUser.phone ?? payload.phone ?? '',
      schoolId: canonicalSchoolId,
      school_id: canonicalSchoolId,
      schoolName: serverUser.schoolName || payload.schoolName,
      staffId: serverUser.staffId || linkedProfile?.staffId || payload.staffId,
      studentId: serverUser.studentId || linkedProfile?.studentId || payload.studentId,
      class: serverUser.class || linkedProfile?.class || payload.class,
      assignedClasses: serverUser.assignedClasses || linkedProfile?.assignedClasses || payload.assignedClasses,
      subjects: serverUser.subjects || linkedProfile?.subjects || payload.subjects,
      linkedProfile
    };
  },

  update: async (id: number | string, updates: any) => {
    const targetSchoolId = updates.school_id || updates.schoolId || (await getCurrentSchoolId());
    const qParams = new URLSearchParams();
    if (targetSchoolId) qParams.set('school_id', targetSchoolId);
    if (updates.username) qParams.set('username', String(updates.username));

    const res = await fetch(`/api/users/${encodeURIComponent(String(id))}?${qParams.toString()}`, {
      method: 'PUT',
      headers: getApiHeaders(targetSchoolId || undefined),
      body: JSON.stringify(updates)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Failed to update user account in Supabase (HTTP ${res.status})`);
    }

    return data.user || true;
  },

  delete: async (
    id: number | string,
    usernameOrOpts?: string | { username?: string; school_id?: string; schoolId?: string },
    schoolId?: string
  ) => {
    const opts: { username?: string; school_id?: string; schoolId?: string } =
      typeof usernameOrOpts === 'object' && usernameOrOpts !== null
        ? usernameOrOpts
        : { username: typeof usernameOrOpts === 'string' ? usernameOrOpts : undefined, school_id: schoolId };
    const targetSchoolId = opts.school_id || opts.schoolId || schoolId || (await getCurrentSchoolId());
    const qParams = new URLSearchParams();
    if (targetSchoolId) qParams.set('school_id', targetSchoolId);
    if (opts.username) qParams.set('username', String(opts.username));

    const res = await fetch(`/api/users/${encodeURIComponent(String(id))}?${qParams.toString()}`, {
      method: 'DELETE',
      headers: getApiHeaders(targetSchoolId || undefined)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Failed to delete user account in Supabase (HTTP ${res.status})`);
    }

    return true;
  }
};

export const settingsApi = {
  set: async (key: string, value: any, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const existing = await db.settings.where('key').equals(key).first();
    let settingRecord: any = { key, value, school_id: targetSchoolId };
    if (existing && existing.id) {
      await db.settings.update(existing.id, { value });
      settingRecord.id = existing.id;
    } else {
      const id = await db.settings.add({ key, value } as any);
      settingRecord.id = id;
    }

    try {
      await fetch(`/api/db/sync?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({ settings: [settingRecord] })
      });
    } catch (e) {}

    try {
      const { data: remExisting } = await supabase
        .from('settings')
        .select('id')
        .eq('key', key)
        .eq('school_id', targetSchoolId)
        .maybeSingle();
      if (remExisting?.id) {
        await supabase.from('settings').update({ value }).eq('id', remExisting.id);
      } else {
        await supabase.from('settings').insert([{ key, value, school_id: targetSchoolId }]);
      }
    } catch (e) {}

    broadcastLocalMutation('settings', 'update', settingRecord);
    return settingRecord;
  }
};

// ==========================================
// 10. AUTH & RECOVERY API
// ==========================================
export const authApi = {
  forgotPassword: async (emailOrUsername: string) => {
    const cleanInput = emailOrUsername.trim().toLowerCase();

    // 1. Direct validation against Supabase database
    try {
      const { data: dbUser } = await supabase
        .from('users')
        .select('id, username, full_name, email, status')
        .or(`email.ilike.${cleanInput},username.ilike.${cleanInput}`)
        .maybeSingle();

      if (dbUser) {
        const status = (dbUser.status || 'active').toLowerCase();
        if (status === 'suspended' || status === 'inactive') {
          return {
            success: false,
            error: "This account is currently inactive or suspended. Please contact your administrator."
          };
        }

        const targetEmail = dbUser.email || `${dbUser.username}@schoolsphere.xyz`;
        // Trigger Supabase client-side recovery email
        try {
          await supabase.auth.resetPasswordForEmail(targetEmail, {
            redirectTo: `${window.location.origin}/auth/reset-password`
          });
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Client Supabase auth lookup notice:", e);
    }

    // 2. Call authoritative backend API to generate secure reset link and code
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanInput, username: cleanInput })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to process forgot password request.");
    }

    return data;
  },

  resetPassword: async (params: { token?: string; code?: string; email?: string; username?: string; newPassword: string }) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to reset password.");
    }

    return data;
  }
};

// ==========================================
// 11. LICENSE CODES & APP-DRIVEN EMAIL API
// ==========================================
export const licenseCodesApi = {
  sendLicense: async (payload: {
    to?: string;
    email?: string;
    userId?: string;
    schoolName?: string;
    recipientName?: string;
    tier?: string;
  }) => {
    const res = await fetch('/api/send-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || (!data.ok && !data.success)) {
      throw new Error(data.error || 'Failed to generate and send license code');
    }
    return data;
  },

  signup: async (payload: {
    email: string;
    password?: string;
    fullName?: string;
    schoolName?: string;
    tier?: string;
    role?: string;
  }) => {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || (!data.ok && !data.success)) {
      throw new Error(data.error || 'Failed to complete signup');
    }
    return data;
  },

  verifyCode: async (payload: {
    license_code: string;
    email?: string;
    userId?: string;
  }) => {
    const res = await fetch('/api/license/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || (!data.ok && !data.success)) {
      throw new Error(data.error || 'Invalid or unverified license code');
    }
    return data;
  },

  resendCode: async (payload: {
    email: string;
    userId?: string;
    schoolName?: string;
    fullName?: string;
  }) => {
    const res = await fetch('/api/license/resend-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || (!data.ok && !data.success)) {
      throw new Error(data.error || 'Failed to resend license code');
    }
    return data;
  },

  testSmtp: async (payload?: {
    to?: string;
    customHost?: string;
    customPort?: number;
    customUser?: string;
    customPass?: string;
    customFrom?: string;
  }) => {
    const res = await fetch('/api/email/test-smtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to send test email');
    }
    return data;
  }
};

// ==========================================
// 12. CANONICAL SCHOOL LICENSES API (SUPABASE SINGLE SOURCE OF TRUTH)
// ==========================================
export const licensesApi = {
  getStatus: licenseApi.getStatus,

  getAll: async () => {
    const res = await fetch('/api/license/list', {
      headers: getApiHeaders()
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to fetch licenses from Supabase');
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  generate: async (payload: {
    schoolName: string;
    durationMonths?: string;
    tier?: string;
    activeModules?: string[];
    clientEmail?: string;
    contactPerson?: string;
    sendEmail?: boolean;
    googleAccessToken?: string;
  }) => {
    const headers = getApiHeaders();
    if (payload.googleAccessToken) {
      headers['Authorization'] = `Bearer ${payload.googleAccessToken}`;
    }
    const res = await fetch('/api/license/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.license) {
      throw new Error(data.error || 'Failed to generate and persist license in Supabase');
    }
    return data;
  },

  update: async (payload: {
    key?: string;
    schoolId?: string;
    schoolName?: string;
    tier?: string;
    status?: string;
    expiryDate?: number | null;
  }) => {
    const res = await fetch('/api/license/update', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update license in Supabase');
    }
    return data;
  },

  revoke: async (payload: {
    key?: string;
    schoolId?: string;
    schoolName?: string;
    slug?: string;
    status?: 'suspended' | 'active' | 'revoked';
  }) => {
    const res = await fetch('/api/license/revoke', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update license status in Supabase');
    }
    return data;
  },

  validate: async (key: string) => {
    const res = await fetch('/api/license/validate', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ key })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Invalid license key');
    }
    return data;
  },

  repairRelationships: async () => {
    const res = await fetch('/api/license/repair-relationships', {
      method: 'POST',
      headers: getApiHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to reconcile school-license relationships');
    }
    return data;
  }
};

// ============================================================================
// LESSON NOTES & HOD / HEADMASTER REVIEW API (SUPABASE)
// ============================================================================
export const lessonNotesApi = {
  getAll: async (
    filters?: {
      term?: string;
      weekNumber?: number;
      class?: string;
      subject?: string;
      teacherId?: string;
      status?: string;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const params = new URLSearchParams();
    if (activeSchoolId) params.set('school_id', activeSchoolId);
    if (filters?.term && filters.term !== 'All') params.set('term', filters.term);
    if (filters?.weekNumber && Number(filters.weekNumber) > 0) params.set('week_number', String(filters.weekNumber));
    if (filters?.class && filters.class !== 'All') params.set('class', filters.class);
    if (filters?.subject && filters.subject !== 'All') params.set('subject', filters.subject);
    if (filters?.teacherId && filters.teacherId !== 'All') params.set('teacher_id', filters.teacherId);
    if (filters?.status && filters.status !== 'All') params.set('status', filters.status);

    const res = await fetch(`/api/lesson-notes?${params.toString()}`, {
      headers: getApiHeaders(activeSchoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to fetch lesson notes from Supabase');

    const notes = Array.isArray(data.lessonNotes) ? data.lessonNotes : [];
    if (notes.length > 0) {
      try {
        await reconcileLessonNotesInDexie(notes);
      } catch {}
    }
    return {
      lessonNotes: notes,
      schoolId: data.schoolId || activeSchoolId,
      storageSource: data.storageSource || 'public.lesson_notes',
      tableReady: data.tableReady !== false
    };
  },

  uploadPdf: async (
    payload: {
      noteId?: string;
      fileName: string;
      fileSize?: number;
      pdfBase64: string;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/lesson-notes/upload-pdf', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        noteId: payload.noteId,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        pdfBase64: payload.pdfBase64
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to upload lesson note PDF to Supabase Storage');
    }
    return data as {
      success: boolean;
      pdfFileName: string;
      pdfFileSize: number;
      pdfFileUrl: string;
      pdfStoragePath: string;
      pdfUploadedAt: number;
      bucket: string;
    };
  },

  save: async (notePayload: any, schoolId?: string) => {
    const activeSchoolId = schoolId || notePayload?.school_id || notePayload?.schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/lesson-notes', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        lessonNote: {
          ...notePayload,
          school_id: activeSchoolId
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to save lesson note to Supabase');
    }

    const allNotes = Array.isArray(data.lessonNotes)
      ? data.lessonNotes
      : (data.lessonNote ? [data.lessonNote] : []);
    if (allNotes.length > 0) {
      try {
        await reconcileLessonNotesInDexie(allNotes);
      } catch {}
    }

    return {
      lessonNote: data.lessonNote || notePayload,
      lessonNotes: allNotes,
      tableReady: data.tableReady !== false,
      syncedAt: data.syncedAt || Date.now()
    };
  },

  review: async (
    noteId: string,
    reviewPayload: {
      status: 'Approved' | 'Needs Revision' | 'Rejected' | 'Pending Review';
      reviewerFeedback?: string;
      reviewedBy?: string;
      reviewerRole?: string;
      lessonNote?: any;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(`/api/lesson-notes/${encodeURIComponent(noteId)}/review`, {
      method: 'PATCH',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        noteId,
        ...reviewPayload
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to submit lesson note review to Supabase');
    }

    const allNotes = Array.isArray(data.lessonNotes)
      ? data.lessonNotes
      : (data.lessonNote ? [data.lessonNote] : []);
    if (allNotes.length > 0) {
      try {
        await reconcileLessonNotesInDexie(allNotes);
      } catch {}
    }

    return {
      lessonNote: data.lessonNote,
      lessonNotes: allNotes,
      tableReady: data.tableReady !== false,
      syncedAt: data.syncedAt || Date.now()
    };
  },

  delete: async (noteId: string, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(`/api/lesson-notes/${encodeURIComponent(noteId)}?school_id=${encodeURIComponent(activeSchoolId || '')}`, {
      method: 'DELETE',
      headers: getApiHeaders(activeSchoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to delete lesson note from Supabase');
    }

    try {
      const local = await db.lessonNotes.toArray();
      const target = local.find(n => String(n.noteId) === String(noteId) || String(n.id) === String(noteId));
      if (target?.id !== undefined) {
        await db.lessonNotes.delete(target.id);
      }
    } catch {}

    return data;
  },

  syncLocalToSupabase: async (localNotes?: any[], schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const notesToSync = Array.isArray(localNotes)
      ? localNotes
      : await db.lessonNotes.toArray();

    const res = await fetch('/api/lesson-notes/sync', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        lessonNotes: notesToSync
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to sync lesson notes with Supabase');

    const remoteNotes = Array.isArray(data.lessonNotes) ? data.lessonNotes : [];
    if (remoteNotes.length > 0) {
      try {
        await reconcileLessonNotesInDexie(remoteNotes);
      } catch {}
    }

    return {
      lessonNotes: remoteNotes,
      tableReady: data.tableReady !== false,
      syncedAt: data.syncedAt || Date.now()
    };
  }
};

async function reconcileLessonNotesInDexie(remoteNotes: any[]) {
  if (!Array.isArray(remoteNotes)) return;
  const local = await db.lessonNotes.toArray();
  const byNoteId = new Map<string, any>();
  for (const item of local) {
    if (item.noteId) byNoteId.set(String(item.noteId), item);
  }

  for (const remote of remoteNotes) {
    if (!remote) continue;
    const noteId = String(remote.noteId || remote.note_id || '').trim();
    if (!noteId) continue;

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
      classSize: remote.classSize !== undefined || remote.class_size !== undefined
        ? Number(remote.classSize ?? remote.class_size) || undefined
        : undefined,
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
      pdfFileSize: remote.pdfFileSize !== undefined || remote.pdf_file_size !== undefined
        ? Number(remote.pdfFileSize ?? remote.pdf_file_size) || undefined
        : undefined,
      pdfFileUrl: remote.pdfFileUrl || remote.pdf_file_url || undefined,
      pdfStoragePath: remote.pdfStoragePath || remote.pdf_storage_path || undefined,
      pdfData: remote.pdfData || remote.pdf_data || undefined,
      pdfUploadedAt: remote.pdfUploadedAt !== undefined || remote.pdf_uploaded_at !== undefined
        ? Number(remote.pdfUploadedAt ?? remote.pdf_uploaded_at) || undefined
        : undefined,
      status: (remote.status || 'Draft') as 'Draft' | 'Pending Review' | 'Approved' | 'Needs Revision' | 'Rejected',
      submittedAt: remote.submittedAt ?? remote.submitted_at ?? undefined,
      reviewedBy: remote.reviewedBy || remote.reviewed_by || undefined,
      reviewerRole: remote.reviewerRole || remote.reviewer_role || undefined,
      reviewerFeedback: remote.reviewerFeedback ?? remote.reviewer_feedback ?? undefined,
      reviewedAt: remote.reviewedAt ?? remote.reviewed_at ?? undefined,
      createdAt: Number(remote.createdAt ?? remote.created_at ?? Date.now()) || Date.now(),
      updatedAt: Number(remote.updatedAt ?? remote.updated_at ?? Date.now()) || Date.now()
    };

    const existing = byNoteId.get(noteId);
    if (existing?.id !== undefined) {
      await db.lessonNotes.update(existing.id, {
        ...normalized,
        pdfFileUrl: normalized.pdfFileUrl || existing.pdfFileUrl,
        pdfStoragePath: normalized.pdfStoragePath || existing.pdfStoragePath,
        pdfData: normalized.pdfData || existing.pdfData,
        id: existing.id
      });
    } else {
      await db.lessonNotes.add(normalized);
    }
  }
}

// ============================================================================
// CAMPUS-WIDE SIREN & BROADCAST CONSOLE API (SUPABASE + STORAGE + AUDIT LOGS)
// ============================================================================
export async function reconcileSirenStateInDexie(state: {
  activeSirenBroadcast?: any | null;
  bellSchedule?: any[];
  timetableSlots?: any[];
  recordedAudioList?: any[];
  acousticVolume?: number;
  isGloballyMuted?: boolean;
  sirenLogs?: any[];
}) {
  if (!state || typeof state !== 'object') return;
  const settingsToReconcile: Array<{ key: string; value: any }> = [];

  if (state.activeSirenBroadcast !== undefined) {
    settingsToReconcile.push({ key: 'activeSirenBroadcast', value: state.activeSirenBroadcast });
  }
  if (Array.isArray(state.bellSchedule)) {
    settingsToReconcile.push({ key: 'bellSchedule', value: state.bellSchedule });
  }
  if (Array.isArray(state.timetableSlots) && state.timetableSlots.length > 0) {
    settingsToReconcile.push({ key: 'timetable_slots', value: state.timetableSlots });
  }
  if (Array.isArray(state.recordedAudioList)) {
    settingsToReconcile.push({ key: 'recordedAudioList', value: state.recordedAudioList });
  }
  if (state.acousticVolume !== undefined && !isNaN(Number(state.acousticVolume))) {
    settingsToReconcile.push({ key: 'acousticVolume', value: Number(state.acousticVolume) });
  }
  if (state.isGloballyMuted !== undefined) {
    settingsToReconcile.push({ key: 'isGloballyMuted', value: Boolean(state.isGloballyMuted) });
  }
  if (Array.isArray(state.sirenLogs)) {
    settingsToReconcile.push({ key: 'sirenLogs', value: state.sirenLogs });
    try {
      localStorage.setItem('esepa_siren_logs', JSON.stringify(state.sirenLogs));
    } catch {}
  }

  if (settingsToReconcile.length > 0) {
    await reconcileSettingsInDexie(settingsToReconcile);
  }
}

export const sirenApi = {
  getState: async (schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const params = new URLSearchParams();
    if (activeSchoolId) params.set('school_id', activeSchoolId);

    const res = await fetch(`/api/siren/state?${params.toString()}`, {
      headers: getApiHeaders(activeSchoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to fetch Siren Console state from Supabase');
    }

    await reconcileSirenStateInDexie(data);
    return {
      ...data,
      sirenBells: data.bellSchedule || [],
      sirenRecordings: data.recordedAudioList || [],
      updatedAt: data.syncedAt || data.updatedAt || Date.now()
    };
  },

  syncWithTimetable: async (
    options?: {
      bellSchedule?: any[];
      forceFromTimetable?: boolean;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/siren/sync-timetable', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        bellSchedule: options?.bellSchedule,
        forceFromTimetable: options?.forceFromTimetable !== false
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to synchronize School Timetable and Period Bell Timetable');
    }

    await reconcileSirenStateInDexie(data);
    return {
      ...data,
      sirenBells: data.bellSchedule || [],
      sirenRecordings: data.recordedAudioList || [],
      updatedAt: data.syncedAt || Date.now()
    };
  },

  getDbStatus: async (schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(`/api/siren/db-status?school_id=${encodeURIComponent(activeSchoolId || '')}`, {
      headers: getApiHeaders(activeSchoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to inspect Siren Console Supabase tables');
    }
    return data;
  },

  provisionTables: async (schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/siren/provision-tables', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({ school_id: activeSchoolId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to provision Siren Console Supabase tables');
    }
    if (data.state) {
      await reconcileSirenStateInDexie(data.state);
    }
    return data;
  },

  syncState: async (
    localPayload?: {
      bellSchedule?: any[];
      sirenBells?: any[];
      recordedAudioList?: any[];
      sirenRecordings?: any[];
      sirenLogs?: any[];
      acousticVolume?: number;
      forcePushSchedule?: boolean;
      seedDefaultsIfEmpty?: boolean;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const normalizedPayload = {
      ...(localPayload || {}),
      bellSchedule: localPayload?.bellSchedule || localPayload?.sirenBells,
      recordedAudioList: localPayload?.recordedAudioList || localPayload?.sirenRecordings
    };
    try {
      const res = await fetch('/api/siren/sync', {
        method: 'POST',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          school_id: activeSchoolId,
          ...normalizedPayload
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to sync Siren Console with Supabase');
      }

      await reconcileSirenStateInDexie(data);
      return {
        ...data,
        sirenBells: data.bellSchedule || [],
        sirenRecordings: data.recordedAudioList || [],
        updatedAt: data.syncedAt || data.updatedAt || Date.now(),
        queued: false,
        queuedOffline: false
      };
    } catch {
      return {
        success: true,
        schoolId: activeSchoolId,
        bellSchedule: normalizedPayload.bellSchedule || [],
        sirenBells: normalizedPayload.bellSchedule || [],
        recordedAudioList: normalizedPayload.recordedAudioList || [],
        sirenRecordings: normalizedPayload.recordedAudioList || [],
        sirenLogs: normalizedPayload.sirenLogs || [],
        queued: true,
        queuedOffline: true,
        syncedAt: Date.now()
      };
    }
  },

  triggerBroadcast: async (
    rawInput: any,
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const payload = rawInput?.broadcast ? { ...rawInput.broadcast, logId: rawInput.logEntry?.id } : (rawInput || {});
    const logObj = rawInput?.logEntry || null;
    const now = payload.timestamp || logObj?.timestamp || Date.now();

    const optimisticBroadcast = {
      id: payload.id || `BRC-${now}`,
      type: payload.type || 'bell',
      label: payload.label || 'Campus Alert',
      customMsg: payload.customMsg || 'Standard broadcast triggered.',
      isDrill: Boolean(payload.isDrill),
      triggeredBy: payload.triggeredBy || 'Administrator',
      role: payload.role || logObj?.role || 'admin',
      ...(payload.audioUrl ? { audioUrl: payload.audioUrl } : {}),
      ...(payload.base64 ? { base64: payload.base64 } : {}),
      timestamp: now,
      schoolId: activeSchoolId
    };
    const optimisticLog = {
      id: logObj?.id || payload.logId || `LOG-${now}`,
      type: logObj?.type || optimisticBroadcast.type,
      label: logObj?.label || optimisticBroadcast.label,
      customMsg: logObj?.customMsg || optimisticBroadcast.customMsg || 'Standard broadcast triggered.',
      isDrill: Boolean(logObj?.isDrill ?? optimisticBroadcast.isDrill),
      triggeredBy: logObj?.triggeredBy || optimisticBroadcast.triggeredBy || 'Administrator',
      role: logObj?.role || optimisticBroadcast.role || 'admin',
      timestamp: now,
      schoolId: activeSchoolId
    };

    const existingLogsSetting = await db.settings.where('key').equals('sirenLogs').first();
    const currentLogs = Array.isArray(existingLogsSetting?.value)
      ? existingLogsSetting.value
      : (() => {
          try {
            return JSON.parse(localStorage.getItem('esepa_siren_logs') || '[]');
          } catch {
            return [];
          }
        })();
    const nextLogs = [optimisticLog, ...currentLogs.filter((l: any) => String(l.id) !== optimisticLog.id)].slice(0, 100);

    await reconcileSirenStateInDexie({
      activeSirenBroadcast: optimisticBroadcast,
      sirenLogs: nextLogs
    });
    broadcastLocalMutation('settings', 'update', { key: 'activeSirenBroadcast', value: optimisticBroadcast });

    try {
      const res = await fetch('/api/siren/broadcast', {
        method: 'POST',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          school_id: activeSchoolId,
          ...optimisticBroadcast,
          logId: optimisticLog.id
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to save broadcast to Supabase');
      }
      await reconcileSirenStateInDexie({
        activeSirenBroadcast: data.activeSirenBroadcast,
        sirenLogs: data.sirenLogs
      });
      return {
        ...data,
        queued: false,
        queuedOffline: false
      };
    } catch {
      queueOfflineWrite('siren_api', 'insert', {
        endpoint: '/api/siren/broadcast',
        method: 'POST',
        schoolId: activeSchoolId,
        body: {
          school_id: activeSchoolId,
          ...optimisticBroadcast,
          logId: optimisticLog.id
        }
      });
      return {
        success: true,
        schoolId: activeSchoolId,
        activeSirenBroadcast: optimisticBroadcast,
        log: optimisticLog,
        sirenLogs: nextLogs,
        queued: true,
        queuedOffline: true,
        syncedAt: now
      };
    }
  },

  stopBroadcast: async (schoolIdOrOpts?: any) => {
    const schoolId = typeof schoolIdOrOpts === 'string' ? schoolIdOrOpts : schoolIdOrOpts?.schoolId;
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    await reconcileSirenStateInDexie({ activeSirenBroadcast: null });
    broadcastLocalMutation('settings', 'delete', { key: 'activeSirenBroadcast', value: null });

    try {
      const res = await fetch(`/api/siren/broadcast?school_id=${encodeURIComponent(activeSchoolId || '')}`, {
        method: 'DELETE',
        headers: getApiHeaders(activeSchoolId)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to squelch broadcast in Supabase');
      }
      await reconcileSirenStateInDexie({ activeSirenBroadcast: null });
      return { ...data, queued: false, queuedOffline: false };
    } catch {
      queueOfflineWrite('siren_api', 'delete', {
        endpoint: `/api/siren/broadcast?school_id=${encodeURIComponent(activeSchoolId || '')}`,
        method: 'DELETE',
        schoolId: activeSchoolId
      });
      return {
        success: true,
        schoolId: activeSchoolId,
        activeSirenBroadcast: null,
        queued: true,
        queuedOffline: true,
        syncedAt: Date.now()
      };
    }
  },

  squelch: async (opts?: any) => {
    return sirenApi.stopBroadcast(opts);
  },

  saveSchedule: async (bellSchedule: any[], logOrSchoolId?: any, maybeSchoolId?: string) => {
    const schoolId = typeof logOrSchoolId === 'string' ? logOrSchoolId : maybeSchoolId;
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const sorted = [...(bellSchedule || [])].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    await reconcileSirenStateInDexie({ bellSchedule: sorted });
    broadcastLocalMutation('settings', 'update', { key: 'bellSchedule', value: sorted });

    try {
      const res = await fetch('/api/siren/schedule', {
        method: 'PUT',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          school_id: activeSchoolId,
          bellSchedule: sorted
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to save bell schedule to Supabase');
      }
      await reconcileSirenStateInDexie({ bellSchedule: data.bellSchedule || sorted });
      return { ...data, queued: false, queuedOffline: false };
    } catch {
      queueOfflineWrite('siren_api', 'update', {
        endpoint: '/api/siren/schedule',
        method: 'PUT',
        schoolId: activeSchoolId,
        body: {
          school_id: activeSchoolId,
          bellSchedule: sorted
        }
      });
      return {
        success: true,
        schoolId: activeSchoolId,
        bellSchedule: sorted,
        queued: true,
        queuedOffline: true,
        syncedAt: Date.now()
      };
    }
  },

  saveBells: async (bellSchedule: any[], logEntry?: any, schoolId?: string) => {
    return sirenApi.saveSchedule(bellSchedule, logEntry, schoolId);
  },

  deleteBell: async (bellId: string, _label?: string, schoolId?: string) => {
    const existingEntry = await db.settings.where('key').equals('bellSchedule').first();
    const currentBells = Array.isArray(existingEntry?.value) ? existingEntry.value : [];
    const nextBells = currentBells.filter((b: any) => String(b.id) !== String(bellId));
    return sirenApi.saveSchedule(nextBells, undefined, schoolId);
  },

  saveSettings: async (
    settings: { acousticVolume?: number; isGloballyMuted?: boolean },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    await reconcileSirenStateInDexie(settings);

    try {
      const res = await fetch('/api/siren/settings', {
        method: 'PUT',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          school_id: activeSchoolId,
          ...settings
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to save siren settings to Supabase');
      }
      return { ...data, queued: false, queuedOffline: false };
    } catch {
      queueOfflineWrite('siren_api', 'update', {
        endpoint: '/api/siren/settings',
        method: 'PUT',
        schoolId: activeSchoolId,
        body: {
          school_id: activeSchoolId,
          ...settings
        }
      });
      return {
        success: true,
        schoolId: activeSchoolId,
        ...settings,
        queued: true,
        queuedOffline: true,
        syncedAt: Date.now()
      };
    }
  },

  saveRecording: async (
    rawInput: any,
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const recording = rawInput?.recording ? rawInput.recording : (rawInput || {});
    const now = recording.timestamp || Date.now();
    const optimisticRec = {
      id: recording.id || `rec-${now}`,
      name: recording.name || recording.title || 'Voice Announcement',
      title: recording.title || recording.name || 'Voice Announcement',
      base64: recording.base64,
      audioUrl: recording.audioUrl || undefined,
      mimeType: recording.mimeType || 'audio/webm',
      duration: recording.duration || undefined,
      size: recording.size || 0,
      createdBy: recording.createdBy || 'Administrator',
      timestamp: now
    };

    const existingRecSetting = await db.settings.where('key').equals('recordedAudioList').first();
    const currentRecs = Array.isArray(existingRecSetting?.value) ? existingRecSetting.value : [];
    const nextRecs = [optimisticRec, ...currentRecs.filter((r: any) => String(r.id) !== optimisticRec.id)];
    await reconcileSirenStateInDexie({ recordedAudioList: nextRecs });
    broadcastLocalMutation('settings', 'update', { key: 'recordedAudioList', value: nextRecs });

    try {
      const res = await fetch('/api/siren/recordings', {
        method: 'POST',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          school_id: activeSchoolId,
          recording: optimisticRec
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to save audio recording to Supabase');
      }
      await reconcileSirenStateInDexie({
        recordedAudioList: data.recordedAudioList || nextRecs
      });
      return {
        ...data,
        recording: data.recording || optimisticRec,
        recordedAudioList: data.recordedAudioList || nextRecs,
        queued: false,
        queuedOffline: false
      };
    } catch {
      queueOfflineWrite('siren_api', 'insert', {
        endpoint: '/api/siren/recordings',
        method: 'POST',
        schoolId: activeSchoolId,
        body: {
          school_id: activeSchoolId,
          recording: optimisticRec
        }
      });
      return {
        success: true,
        schoolId: activeSchoolId,
        recording: optimisticRec,
        recordedAudioList: nextRecs,
        queued: true,
        queuedOffline: true,
        syncedAt: now
      };
    }
  },

  deleteRecording: async (recordingId: string, _nameOrSchoolId?: string, maybeSchoolId?: string) => {
    const activeSchoolId = maybeSchoolId || (await resolveActiveSchoolId());
    const existingRecSetting = await db.settings.where('key').equals('recordedAudioList').first();
    const currentRecs = Array.isArray(existingRecSetting?.value) ? existingRecSetting.value : [];
    const nextRecs = currentRecs.filter((r: any) => String(r.id) !== String(recordingId));
    await reconcileSirenStateInDexie({ recordedAudioList: nextRecs });
    broadcastLocalMutation('settings', 'update', { key: 'recordedAudioList', value: nextRecs });

    try {
      const res = await fetch(
        `/api/siren/recordings/${encodeURIComponent(recordingId)}?school_id=${encodeURIComponent(activeSchoolId || '')}`,
        {
          method: 'DELETE',
          headers: getApiHeaders(activeSchoolId)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to delete recording from Supabase');
      }
      await reconcileSirenStateInDexie({
        recordedAudioList: data.recordedAudioList || nextRecs,
        ...(Array.isArray(data.bellSchedule) ? { bellSchedule: data.bellSchedule } : {})
      });
      return { ...data, queued: false, queuedOffline: false };
    } catch {
      queueOfflineWrite('siren_api', 'delete', {
        endpoint: `/api/siren/recordings/${encodeURIComponent(recordingId)}?school_id=${encodeURIComponent(activeSchoolId || '')}`,
        method: 'DELETE',
        schoolId: activeSchoolId
      });
      return {
        success: true,
        schoolId: activeSchoolId,
        deletedId: recordingId,
        recordedAudioList: nextRecs,
        queued: true,
        queuedOffline: true,
        syncedAt: Date.now()
      };
    }
  },

  clearLogs: async (schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    await reconcileSirenStateInDexie({ sirenLogs: [] });

    try {
      const res = await fetch(`/api/siren/logs?school_id=${encodeURIComponent(activeSchoolId || '')}`, {
        method: 'DELETE',
        headers: getApiHeaders(activeSchoolId)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to clear siren logs in Supabase');
      }
      await reconcileSirenStateInDexie({ sirenLogs: [] });
      return { ...data, queued: false, queuedOffline: false };
    } catch {
      queueOfflineWrite('siren_api', 'delete', {
        endpoint: `/api/siren/logs?school_id=${encodeURIComponent(activeSchoolId || '')}`,
        method: 'DELETE',
        schoolId: activeSchoolId
      });
      return {
        success: true,
        schoolId: activeSchoolId,
        sirenLogs: [],
        queued: true,
        queuedOffline: true,
        syncedAt: Date.now()
      };
    }
  }
};

// ============================================================================
// CAMPUS E-VOTING PORTAL SUPABASE CLIENT API
// ============================================================================

async function reconcileEvotingStateInDexie(payload: {
  polls?: any[];
  candidates?: any[];
  votes?: any[];
  students?: any[];
  smsLog?: any;
}) {
  try {
    if (Array.isArray(payload.polls)) {
      await db.polls.clear();
      if (payload.polls.length > 0) {
        await db.polls.bulkPut(
          payload.polls.map((p: any) => ({
            id: Number(p.id),
            title: String(p.title || ''),
            description: String(p.description || ''),
            category: String(p.category || 'SRC General Elections'),
            status: (p.status || 'active') as 'draft' | 'active' | 'completed',
            createdAt: Number(p.createdAt ?? p.created_at ?? Date.now())
          }))
        );
      }
    }

    if (Array.isArray(payload.candidates)) {
      await db.candidates.clear();
      if (payload.candidates.length > 0) {
        await db.candidates.bulkPut(
          payload.candidates.map((c: any) => ({
            id: Number(c.id),
            pollId: Number(c.pollId ?? c.poll_id),
            name: String(c.name || ''),
            position: String(c.position || 'President'),
            class: String(c.class || 'JHS 1'),
            votesCount: Math.max(0, Number(c.votesCount ?? c.votes_count ?? 0)),
            photo: c.photo || undefined,
            manifesto: String(c.manifesto || '')
          }))
        );
      }
    }

    const incomingVotesList = Array.isArray(payload.votes)
      ? payload.votes
      : Array.isArray((payload as any).votesTable)
      ? (payload as any).votesTable
      : null;

    if (Array.isArray(incomingVotesList)) {
      await db.votes.clear();
      if (incomingVotesList.length > 0) {
        await db.votes.bulkPut(
          incomingVotesList.map((v: any, idx: number) => ({
            id: Number(v.id) || idx + 1,
            pollId: Number(v.pollId ?? v.poll_id),
            studentId: String(v.studentId ?? v.student_id ?? '').trim(),
            candidateId: Number(v.candidateId ?? v.candidate_id),
            position: String(v.position || 'President'),
            timestamp: Number(v.timestamp ?? Date.now())
          }))
        );
      }
    }

    if (Array.isArray(payload.students) && payload.students.length > 0) {
      const existingStudents = await db.students.toArray();
      const existingByStudentId = new Map<string, number>();
      existingStudents.forEach((s) => {
        if (s.studentId && s.id != null) {
          existingByStudentId.set(String(s.studentId).toUpperCase(), s.id);
        }
      });

      for (const remStu of payload.students) {
        const sid = String(remStu.studentId || remStu.student_id || '').trim();
        if (!sid) continue;
        const matchedLocalId = existingByStudentId.get(sid.toUpperCase());
        const record = {
          ...(matchedLocalId ? { id: matchedLocalId } : {}),
          studentId: sid,
          firstName: String(remStu.firstName || remStu.first_name || 'Student'),
          lastName: String(remStu.lastName || remStu.last_name || ''),
          class: String(remStu.class || 'P1'),
          dateOfBirth: String(remStu.dateOfBirth || remStu.date_of_birth || '2012-01-01'),
          gender: (remStu.gender === 'Female' ? 'Female' : 'Male') as 'Male' | 'Female',
          guardianName: String(remStu.guardianName || remStu.guardian_name || 'Parent'),
          guardianPhone: String(remStu.guardianPhone || remStu.guardian_phone || '0240000000'),
          feesPaid: Number(remStu.feesPaid ?? remStu.fees_paid ?? 0),
          totalFees: Number(remStu.totalFees ?? remStu.total_fees ?? 0),
          photo: remStu.photo || undefined,
          createdAt: Number(remStu.createdAt ?? remStu.created_at ?? Date.now())
        };
        await db.students.put(record);
      }
    }

    if (payload.smsLog && typeof payload.smsLog === 'object') {
      await db.smsLogs.add({
        recipientPhone: String(payload.smsLog.recipientPhone || '0241234567'),
        recipientName: String(payload.smsLog.recipientName || 'Parent'),
        recipientType: 'Parent',
        message: String(payload.smsLog.message || ''),
        type: 'Notification',
        status: 'Sent',
        createdAt: Number(payload.smsLog.createdAt || Date.now())
      });
    }
  } catch (err) {
    console.warn('Error reconciling E-Voting state in Dexie:', err);
  }
}

export const evotingApi = {
  getState: async (schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(`/api/evoting/state?school_id=${encodeURIComponent(activeSchoolId || '')}`, {
      headers: getApiHeaders(activeSchoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to fetch E-Voting state from Supabase');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  syncState: async (
    localPayload?: { polls?: any[]; candidates?: any[]; votes?: any[]; students?: any[] },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const [localPolls, localCandidates, localVotes, localStudents] = await Promise.all([
      localPayload?.polls ? Promise.resolve(localPayload.polls) : db.polls.toArray(),
      localPayload?.candidates ? Promise.resolve(localPayload.candidates) : db.candidates.toArray(),
      localPayload?.votes ? Promise.resolve(localPayload.votes) : db.votes.toArray(),
      localPayload?.students ? Promise.resolve(localPayload.students) : db.students.toArray()
    ]);

    const res = await fetch('/api/evoting/sync', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        polls: localPolls,
        candidates: localCandidates,
        votes: localVotes,
        students: localStudents
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to synchronize E-Voting Portal with Supabase');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  verifyVoter: async (studentId: string, localStudent?: any, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/evoting/verify-voter', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        studentId: studentId.trim(),
        localStudent
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'No matching student found with that ID card.');
    }
    return data;
  },

  createPoll: async (
    poll: { title: string; description: string; category: string; status?: string },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/evoting/polls', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        ...poll,
        createdAt: Date.now()
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to create election poll in Supabase');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  updatePoll: async (
    pollId: number,
    updates: { status?: string; title?: string; description?: string; category?: string },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(`/api/evoting/polls/${encodeURIComponent(String(pollId))}`, {
      method: 'PUT',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        ...updates
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to update election status in Supabase');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  deletePoll: async (pollId: number, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(
      `/api/evoting/polls/${encodeURIComponent(String(pollId))}?school_id=${encodeURIComponent(activeSchoolId || '')}`,
      {
        method: 'DELETE',
        headers: getApiHeaders(activeSchoolId)
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to delete election from Supabase');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  addCandidate: async (
    candidate: {
      pollId: number;
      name: string;
      position: string;
      class: string;
      manifesto: string;
      photo?: string;
      photoBase64?: string;
      photoMimeType?: string;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/evoting/candidates', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        ...candidate
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to register nominee in Supabase');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  deleteCandidate: async (candidateId: number, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(
      `/api/evoting/candidates/${encodeURIComponent(String(candidateId))}?school_id=${encodeURIComponent(activeSchoolId || '')}`,
      {
        method: 'DELETE',
        headers: getApiHeaders(activeSchoolId)
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to delete nominee from Supabase');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  castVote: async (
    params: {
      pollId: number;
      studentId: string;
      selections: Record<string, number>;
      student?: any;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/evoting/vote', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        pollId: params.pollId,
        studentId: params.studentId,
        selections: params.selections,
        student: params.student
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const err: any = new Error(data.error || 'Failed to submit ballot to Supabase');
      err.alreadyVoted = Boolean(data.alreadyVoted);
      throw err;
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  getVotesTable: async (
    params?: {
      pollId?: number;
      position?: string;
      studentClass?: string;
      search?: string;
      schoolId?: string;
    }
  ) => {
    const activeSchoolId = params?.schoolId || (await resolveActiveSchoolId());
    const qs = new URLSearchParams();
    if (activeSchoolId) qs.set('school_id', activeSchoolId);
    if (params?.pollId) qs.set('pollId', String(params.pollId));
    if (params?.position) qs.set('position', params.position);
    if (params?.studentClass) qs.set('studentClass', params.studentClass);
    if (params?.search) qs.set('search', params.search);

    const res = await fetch(`/api/evoting/votes-table?${qs.toString()}`, {
      headers: getApiHeaders(activeSchoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to fetch votes_table records from Supabase');
    }
    if (!params?.pollId && !params?.position && !params?.studentClass && !params?.search) {
      await reconcileEvotingStateInDexie({
        polls: data.polls,
        candidates: data.candidates,
        votes: data.votesTable,
        students: data.students
      });
    }
    return data;
  },

  verifyBallotReceipt: async (query: string, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(
      `/api/evoting/votes-table/verify/${encodeURIComponent(query.trim())}?school_id=${encodeURIComponent(activeSchoolId || '')}`,
      {
        headers: getApiHeaders(activeSchoolId)
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `No ballot record found in Supabase votes_table matching "${query}".`);
    }
    return data;
  },

  recountVotesTable: async (pollId?: number, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/evoting/votes-table/recount', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        pollId: pollId || 0
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to recount votes_table tallies in Supabase');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  voidVoteRecord: async (
    params: { id?: number; pollId?: number; studentId?: string; position?: string },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const idTarget = params.id || 'by-voter';
    const qs = new URLSearchParams();
    if (activeSchoolId) qs.set('school_id', activeSchoolId);
    if (params.pollId) qs.set('pollId', String(params.pollId));
    if (params.studentId) qs.set('studentId', params.studentId);
    if (params.position) qs.set('position', params.position);

    const res = await fetch(`/api/evoting/votes-table/${encodeURIComponent(String(idTarget))}?${qs.toString()}`, {
      method: 'DELETE',
      headers: getApiHeaders(activeSchoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to void ballot in Supabase votes_table');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  },

  resetPollVotes: async (pollId: number, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const qs = new URLSearchParams();
    if (activeSchoolId) qs.set('school_id', activeSchoolId);
    qs.set('pollId', String(pollId));

    const res = await fetch(`/api/evoting/votes-table/reset-poll?${qs.toString()}`, {
      method: 'DELETE',
      headers: getApiHeaders(activeSchoolId)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to reset poll test votes in Supabase votes_table');
    }
    await reconcileEvotingStateInDexie(data);
    return data;
  }
};

export interface StockMovementRecord {
  id?: number;
  schoolId?: string;
  inventoryItemId: number;
  itemName: string;
  category?: string;
  change: number;
  movementType: 'RESTOCK' | 'ISSUE' | 'ADJUSTMENT' | 'INITIAL';
  previousQuantity?: number;
  newQuantity?: number;
  reason: string;
  performedBy: string;
  movedBy?: number | null;
  createdAt: number;
}

export async function reconcileInventoryStateInDexie(payload: {
  items?: any[];
  expenses?: any[];
}) {
  try {
    if (Array.isArray(payload.items)) {
      await db.inventory.clear();
      if (payload.items.length > 0) {
        await db.inventory.bulkPut(
          payload.items.map((item: any) => ({
            id: Number(item.id),
            itemName: String(item.itemName || item.item_name || 'Commodity'),
            category: (item.category || 'General') as any,
            quantity: Math.max(0, Number(item.quantity ?? 0)),
            minQuantity: Math.max(0, Number(item.minQuantity ?? item.min_quantity ?? 5)),
            unitPrice: Math.max(0, Number(item.unitPrice ?? item.unit_price ?? 0)),
            location: String(item.location || 'General Storehouse'),
            supplierName: item.supplierName || item.supplier_name || undefined,
            supplierPhone: item.supplierPhone || item.supplier_phone || undefined,
            lastUpdated: Number(item.lastUpdated || item.last_updated || Date.now())
          }))
        );
      }
    }

    if (Array.isArray(payload.expenses)) {
      await db.expenses.clear();
      if (payload.expenses.length > 0) {
        await db.expenses.bulkPut(
          payload.expenses.map((exp: any) => ({
            id: Number(exp.id),
            description: String(exp.description || 'Expense'),
            category: (exp.category || 'Administrative') as any,
            amount: Math.max(0, Number(exp.amount ?? 0)),
            date: Number(exp.date || Date.now()),
            inventoryItemId:
              exp.inventoryItemId !== undefined && exp.inventoryItemId !== null
                ? Number(exp.inventoryItemId)
                : exp.inventory_item_id !== undefined && exp.inventory_item_id !== null
                ? Number(exp.inventory_item_id)
                : undefined,
            quantityPurchased:
              exp.quantityPurchased !== undefined && exp.quantityPurchased !== null
                ? Number(exp.quantityPurchased)
                : exp.quantity_purchased !== undefined && exp.quantity_purchased !== null
                ? Number(exp.quantity_purchased)
                : undefined,
            paymentMethod: (exp.paymentMethod || exp.payment_method || 'Mobile Money') as any,
            recordedBy: String(exp.recordedBy || exp.recorded_by || 'Accountant')
          }))
        );
      }
    }
  } catch (err) {
    console.warn('[reconcileInventoryStateInDexie] Warning:', err);
  }
}

export const inventoryApi = {
  getState: async (schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(
      `/api/inventory/state?school_id=${encodeURIComponent(activeSchoolId || '')}`,
      {
        headers: getApiHeaders(activeSchoolId)
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to load Inventory Registry state from Supabase');
    }
    await reconcileInventoryStateInDexie(data);
    return data;
  },

  syncState: async (
    payload?: { items?: any[]; expenses?: any[] },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const localItems = payload?.items ?? (await db.inventory.toArray());
    const localExpenses = payload?.expenses ?? (await db.expenses.toArray());

    const res = await fetch('/api/inventory/sync', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        school_id: activeSchoolId,
        items: localItems,
        expenses: localExpenses
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to synchronize Inventory Registry with Supabase');
    }
    await reconcileInventoryStateInDexie(data);
    return data;
  },

  saveItem: async (
    item: {
      id?: number | null;
      itemName: string;
      category: string;
      quantity: number;
      minQuantity: number;
      unitPrice: number;
      location: string;
      supplierName?: string;
      supplierPhone?: string;
      performedBy?: string;
      reason?: string;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const isEdit = item.id !== undefined && item.id !== null;
    const endpoint = isEdit ? `/api/inventory/items/${item.id}` : '/api/inventory/items';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(endpoint, {
      method,
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        ...item,
        school_id: activeSchoolId
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to save inventory commodity in Supabase');
    }
    await reconcileInventoryStateInDexie(data);
    return data;
  },

  adjustQuantity: async (
    params: {
      id: number;
      delta?: number;
      newQuantity?: number;
      movementType?: 'RESTOCK' | 'ISSUE' | 'ADJUSTMENT';
      reason?: string;
      performedBy?: string;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(`/api/inventory/items/${params.id}/adjust`, {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        ...params,
        school_id: activeSchoolId
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to adjust commodity stock quantity in Supabase');
    }
    await reconcileInventoryStateInDexie(data);
    return data;
  },

  deleteItem: async (id: number, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(
      `/api/inventory/items/${id}?school_id=${encodeURIComponent(activeSchoolId || '')}`,
      {
        method: 'DELETE',
        headers: getApiHeaders(activeSchoolId)
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to delete inventory commodity from Supabase');
    }
    await reconcileInventoryStateInDexie(data);
    return data;
  },

  createExpense: async (
    expense: {
      description: string;
      category: string;
      amount: number;
      date?: number;
      inventoryItemId?: number | null;
      quantityPurchased?: number;
      unitPrice?: number;
      paymentMethod: string;
      recordedBy: string;
    },
    schoolId?: string
  ) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch('/api/inventory/expenses', {
      method: 'POST',
      headers: getApiHeaders(activeSchoolId),
      body: JSON.stringify({
        ...expense,
        school_id: activeSchoolId
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to record school expense in Supabase');
    }
    await reconcileInventoryStateInDexie(data);
    return data;
  },

  deleteExpense: async (id: number, schoolId?: string) => {
    const activeSchoolId = schoolId || (await resolveActiveSchoolId());
    const res = await fetch(
      `/api/inventory/expenses/${id}?school_id=${encodeURIComponent(activeSchoolId || '')}`,
      {
        method: 'DELETE',
        headers: getApiHeaders(activeSchoolId)
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to delete expense record from Supabase');
    }
    await reconcileInventoryStateInDexie(data);
    return data;
  }
};

