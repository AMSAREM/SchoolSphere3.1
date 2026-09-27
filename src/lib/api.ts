import { supabase, getCurrentSchoolId } from './supabase';
import { db, normalizeStudentRecord } from '../db/schema';
import { 
  reconcileClassesInDexie, 
  reconcileTeachersInDexie, 
  reconcileSubjectsInDexie, 
  reconcileStudentsInDexie,
  reconcileAttendanceInDexie,
  reconcileResultsInDexie,
  reconcileTermReportsInDexie,
  reconcileSettingsInDexie,
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
      promotionHistory: await db.promotionHistory.toArray()
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
// 5. RESULTS & EXAM ANALYSIS API
// ==========================================
export const resultsApi = {
  getByClassAndTerm: async (className: string, term: string, subject?: string, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
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
      if (!error && data && data.length > 0) return data;
    } catch (e) {}

    let localResults = await db.results.where({ class: className, term: term }).toArray();
    if (subject) {
      localResults = localResults.filter(r => r.subject === subject);
    }
    return localResults;
  },

  recordScores: async (scores: any[], schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const recordsWithTenant = scores.map(s => ({ ...s, school_id: targetSchoolId }));
    
    await db.results.bulkPut(recordsWithTenant);

    try {
      await fetch(`/api/db/sync?school_id=${encodeURIComponent(targetSchoolId || '')}`, {
        method: 'POST',
        headers: getApiHeaders(targetSchoolId || undefined),
        body: JSON.stringify({ results: recordsWithTenant })
      });
    } catch (e) {}

    try {
      const snakeScores = scores.map(s => ({
        school_id: targetSchoolId,
        student_id: s.studentId || s.student_id,
        subject: s.subject,
        term: s.term,
        class: s.class,
        class_score: Number(s.classScore ?? s.class_score ?? 0),
        exam_score: Number(s.examScore ?? s.exam_score ?? 0),
        total_score: Number(s.totalScore ?? s.total_score ?? 0),
        grade: s.grade || '',
        remarks: s.remarks || ''
      }));
      await supabase.from('results').upsert(snakeScores, { onConflict: 'school_id,student_id,subject,term' });
    } catch (e) {}
    return true;
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
// 7. FEES & FINANCIAL TRANSACTIONS API
// ==========================================
export const feesApi = {
  recordPayment: async (paymentData: { studentId: string; amount: number; description?: string }, schoolId?: string) => {
    const targetSchoolId = schoolId || (await getCurrentSchoolId());
    const student = await db.students.where('studentId').equals(paymentData.studentId).first();
    if (student && student.id) {
      const newFeesPaid = (student.feesPaid || 0) + paymentData.amount;
      await studentsApi.update(student.id, { feesPaid: newFeesPaid, studentId: paymentData.studentId }, targetSchoolId || undefined);
    } else {
      try {
        await supabase
          .from('students')
          .update({ fees_paid: paymentData.amount })
          .eq('school_id', targetSchoolId)
          .eq('student_id', paymentData.studentId);
      } catch (e) {}
    }
    return true;
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



