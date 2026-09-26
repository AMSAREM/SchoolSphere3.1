import { db, normalizeStudentRecord } from '../db/schema';
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
    if (remote.id) remoteIds.add(remote.id);

    let existing = nameMap.get(key);
    if (!existing && remote.id && idMap.has(remote.id)) {
      existing = idMap.get(remote.id);
    }

    if (existing) {
      await db.classes.update(existing.id, {
        ...remote,
        id: existing.id
      });
    } else {
      const { id, ...rest } = remote;
      const newId = await db.classes.add(rest);
      nameMap.set(key, { ...remote, id: newId });
    }
  }

  // Prune local classes that were deleted or renamed remotely during full sync
  if (isFullSync && remoteClasses.length > 0) {
    for (const local of localClasses) {
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
    if (remote.id) remoteIds.add(remote.id);

    let existing = staffId ? staffMap.get(staffId) : null;
    if (!existing && remote.id && idMap.has(remote.id)) {
      existing = idMap.get(remote.id);
    }

    const payload = {
      ...remote,
      assignedClasses: typeof remote.assignedClasses === 'string' ? JSON.parse(remote.assignedClasses || '[]') : (remote.assignedClasses || []),
      subjects: typeof remote.subjects === 'string' ? JSON.parse(remote.subjects || '[]') : (remote.subjects || [])
    };

    if (existing) {
      await db.teachers.update(existing.id, {
        ...payload,
        id: existing.id
      });
    } else {
      const { id, ...rest } = payload;
      const newId = await db.teachers.add(rest);
      if (staffId) staffMap.set(staffId, { ...payload, id: newId });
    }
  }

  // Prune local teachers that were removed remotely during full sync
  if (isFullSync && remoteTeachers.length > 0) {
    for (const local of localTeachers) {
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
  const remoteIds = new Set<string | number>();

  for (const remote of remoteSubjects) {
    if (!remote) continue;
    const code = (remote.code || '').trim().toLowerCase();
    const name = (remote.name || '').trim().toLowerCase();
    if (code) remoteCodes.add(code);
    if (remote.id) remoteIds.add(remote.id);

    const key = code || name;
    let existing = key ? codeMap.get(key) : null;
    if (!existing && remote.id && idMap.has(remote.id)) {
      existing = idMap.get(remote.id);
    }

    const payload = {
      ...remote,
      applicableClasses: typeof remote.applicableClasses === 'string' ? JSON.parse(remote.applicableClasses || '[]') : (remote.applicableClasses || ['All'])
    };

    if (existing) {
      await db.subjects.update(existing.id, {
        ...payload,
        id: existing.id
      });
    } else {
      const { id, ...rest } = payload;
      const newId = await db.subjects.add(rest);
      if (key) codeMap.set(key, { ...payload, id: newId });
    }
  }

  // Prune local subjects that were removed remotely during full sync
  if (isFullSync && remoteSubjects.length > 0) {
    for (const local of localSubjects) {
      const code = (local.code || '').trim().toLowerCase();
      const hasCode = code && remoteCodes.has(code);
      const hasId = local.id && remoteIds.has(local.id);
      if (!hasCode && !hasId && local.id) {
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
    if (norm.id) remoteIds.add(norm.id);

    let existing = stuId ? stuMap.get(stuId) : null;
    if (!existing && norm.id && idMap.has(norm.id)) {
      existing = idMap.get(norm.id);
    }

    if (existing) {
      await db.students.update(existing.id, {
        ...norm,
        id: existing.id
      });
    } else {
      const { id, ...rest } = norm;
      const newId = await db.students.add(rest);
      if (stuId) stuMap.set(stuId, { ...norm, id: newId });
    }
  }

  // Prune local students that were deleted remotely during full sync
  if (isFullSync && remoteStudents.length > 0) {
    for (const local of localStudents) {
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
    if (existing) {
      await db.results.update(existing.id, { ...remote, studentId, id: existing.id });
    } else {
      const { id, ...rest } = remote;
      await db.results.add({ ...rest, studentId });
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
    const value = typeof remote.value === 'string' ? JSON.parse(remote.value) : remote.value;
    if (existing) {
      await db.settings.update(existing.id, { key: remote.key, value, id: existing.id });
    } else {
      const { id, ...rest } = remote;
      await db.settings.add({ ...rest, value });
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
        if (item.action === 'insert') {
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
