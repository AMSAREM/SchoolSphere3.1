export interface LicenseRecord {
  key: string;
  license_id?: number | null;
  schoolName: string;
  school_id?: string | null;
  schoolSlug?: string | null;
  clientEmail?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  tier: string;
  durationMonths: string;
  expiryDate: number | null;
  createdAt: number;
  activatedAt?: number | null;
  used?: boolean;
  status: 'active' | 'suspended' | 'expired' | 'revoked' | 'deactivated';
  syncStatus: 'synced' | 'local_only' | 'sync_failed';
  syncError?: string | null;
  activeModules?: string[];
  lockAnnouncement?: string;
  [key: string]: any;
}

export interface TenantLicenseStatusResponse {
  active: boolean;
  status: 'active' | 'suspended' | 'expired' | 'revoked' | 'deactivated';
  licenseKey: string;
  schoolId?: string | null;
  schoolName?: string;
  schoolSlug?: string;
  tier?: string;
  expiryDate?: string | number | null;
  activeModules: string[];
  lockAnnouncement?: string;
  announcement?: string;
  remoteOverride?: boolean;
}

const LEGACY_STORAGE_KEYS = [
  'school_license_override',
  'esepa_generated_licenses',
  'esepa_cached_tenants',
  'esepa_creator_crm_leads',
  'esepa_creator_invoices',
  'esepa_crm_leads_v1',
  'esepa_Pos_invoices_v1'
];

export function purgeLegacyLicenseCaches(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    for (const k of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(k);
    }
  } catch (e) {
    console.warn('Notice purging legacy license cache:', e);
  }
}

// Automatically purge stale local license caches on module load
purgeLegacyLicenseCaches();

function buildAuthHeaders(extraSchoolId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('esepa_auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    let resolvedSchoolId = extraSchoolId;
    if (!resolvedSchoolId) {
      try {
        const activeSchoolRaw = localStorage.getItem('esepa_active_school');
        if (activeSchoolRaw) {
          const parsed = JSON.parse(activeSchoolRaw);
          if (parsed?.id) resolvedSchoolId = String(parsed.id);
        }
      } catch {}
    }
    if (!resolvedSchoolId) {
      try {
        const userRaw = localStorage.getItem('esepa_user');
        if (userRaw) {
          const parsed = JSON.parse(userRaw);
          if (parsed?.school_id || parsed?.schoolId) {
            resolvedSchoolId = String(parsed.school_id || parsed.schoolId);
          }
        }
      } catch {}
    }
    if (resolvedSchoolId) {
      headers['x-school-id'] = resolvedSchoolId;
    }
  }
  return headers;
}

export function broadcastLicenseChange(detail?: any): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('esepa_licenses_updated', { detail }));
    window.dispatchEvent(new CustomEvent('esepa_license_status_changed', { detail }));
  }
}

export async function fetchTenantLicenseStatus(
  schoolId?: string | null,
  role?: string | null
): Promise<TenantLicenseStatusResponse | null> {
  purgeLegacyLicenseCaches();
  try {
    const params = new URLSearchParams();
    if (schoolId) params.set('school_id', schoolId);
    if (role) params.set('role', role);
    const qs = params.toString();
    const res = await fetch(`/api/license/status${qs ? `?${qs}` : ''}`, {
      headers: buildAuthHeaders(schoolId)
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return {
          active: Boolean(data.active),
          status: data.status || (data.active ? 'active' : 'deactivated'),
          licenseKey: data.licenseKey || '',
          schoolId: data.schoolId || schoolId || null,
          schoolName: data.schoolName || '',
          schoolSlug: data.schoolSlug || '',
          tier: data.tier || 'Standard',
          expiryDate: data.expiryDate || null,
          activeModules: Array.isArray(data.activeModules) ? data.activeModules : [],
          lockAnnouncement: data.lockAnnouncement || data.announcement || '',
          announcement: data.announcement || data.lockAnnouncement || '',
          remoteOverride: Boolean(data.remoteOverride)
        };
      }
    }
  } catch (err) {
    console.warn('Failed to fetch live license status from Supabase backend:', err);
  }
  return null;
}

export async function activateTenantLicense(
  licenseKey: string,
  schoolId?: string | null,
  extraPayload?: Record<string, any>
): Promise<{ success: boolean; error?: string; license?: any; school?: any }> {
  purgeLegacyLicenseCaches();
  const cleanKey = String(licenseKey || '').trim().toUpperCase();
  if (!cleanKey) {
    return { success: false, error: 'Please enter a valid license key.' };
  }
  try {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: buildAuthHeaders(schoolId),
      body: JSON.stringify({
        licenseKey: cleanKey,
        schoolId: schoolId || undefined,
        ...(extraPayload || {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      broadcastLicenseChange(data);
      return {
        success: true,
        license: data.license,
        school: data.school
      };
    }
    return {
      success: false,
      error: data?.error || 'Failed to activate license key in Supabase.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while activating license in Supabase.'
    };
  }
}

export async function deactivateTenantLicense(
  schoolId?: string | null,
  licenseKey?: string | null
): Promise<{ success: boolean; error?: string; status?: string }> {
  purgeLegacyLicenseCaches();
  try {
    const res = await fetch('/api/license/deactivate', {
      method: 'POST',
      headers: buildAuthHeaders(schoolId),
      body: JSON.stringify({
        schoolId: schoolId || undefined,
        licenseKey: licenseKey || undefined
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      broadcastLicenseChange(data);
      return {
        success: true,
        status: data.status || 'deactivated'
      };
    }
    return {
      success: false,
      error: data?.error || 'Failed to deactivate license in Supabase.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while deactivating license in Supabase.'
    };
  }
}

export async function updateTenantModules(
  schoolId: string | null | undefined,
  activeModules: string[],
  licenseKey?: string | null
): Promise<{ success: boolean; activeModules?: string[]; error?: string }> {
  purgeLegacyLicenseCaches();
  try {
    const res = await fetch('/api/license/modules', {
      method: 'POST',
      headers: buildAuthHeaders(schoolId),
      body: JSON.stringify({
        schoolId: schoolId || undefined,
        licenseKey: licenseKey || undefined,
        activeModules
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      broadcastLicenseChange(data);
      return {
        success: true,
        activeModules: Array.isArray(data.activeModules) ? data.activeModules : activeModules
      };
    }
    return {
      success: false,
      error: data?.error || 'Failed to update modules in Supabase.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while updating modules in Supabase.'
    };
  }
}

export async function generateSchoolLicense(
  payload: Record<string, any>
): Promise<{ success: boolean; license?: LicenseRecord; provisionedAdmin?: any; emailDispatched?: boolean; message?: string; error?: string }> {
  purgeLegacyLicenseCaches();
  try {
    const res = await fetch('/api/license/generate', {
      method: 'POST',
      headers: buildAuthHeaders(payload.schoolId),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success && data?.license) {
      broadcastLicenseChange(data);
      return {
        success: true,
        license: data.license,
        provisionedAdmin: data.provisionedAdmin || data.license?.provisionedAdmin,
        emailDispatched: Boolean(data.emailDispatched),
        message: data.message || data.emailNotice
      };
    }
    return {
      success: false,
      error: data?.error || 'Failed to generate license in Supabase.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while generating license in Supabase.'
    };
  }
}

export async function updateSchoolLicense(
  payload: Record<string, any>
): Promise<{ success: boolean; license?: LicenseRecord; error?: string }> {
  purgeLegacyLicenseCaches();
  try {
    const res = await fetch('/api/license/update', {
      method: 'POST',
      headers: buildAuthHeaders(payload.schoolId),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      broadcastLicenseChange(data);
      return {
        success: true,
        license: data.license
      };
    }
    return {
      success: false,
      error: data?.error || 'Failed to update school license in Supabase.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while updating license in Supabase.'
    };
  }
}

export async function revokeSchoolLicense(
  key: string,
  schoolId?: string | null,
  status: 'suspended' | 'revoked' | 'active' = 'suspended',
  schoolName?: string | null
): Promise<{ success: boolean; status?: string; error?: string }> {
  purgeLegacyLicenseCaches();
  try {
    const res = await fetch('/api/license/revoke', {
      method: 'POST',
      headers: buildAuthHeaders(schoolId),
      body: JSON.stringify({
        key,
        schoolId: schoolId || undefined,
        schoolName: schoolName || undefined,
        status
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      broadcastLicenseChange(data);
      return {
        success: true,
        status: data.status || status
      };
    }
    return {
      success: false,
      error: data?.error || 'Failed to update license status in Supabase.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while updating license status in Supabase.'
    };
  }
}

export function getStoredLicenses(): LicenseRecord[] {
  purgeLegacyLicenseCaches();
  return [];
}

export function saveStoredLicenses(_licenses: LicenseRecord[]): void {
  purgeLegacyLicenseCaches();
  broadcastLicenseChange();
}

export function getPendingSyncCount(): number {
  return 0;
}

export async function syncPendingLicenses(): Promise<{
  success: boolean;
  syncedCount: number;
  failedCount: number;
  licenses?: LicenseRecord[];
}> {
  purgeLegacyLicenseCaches();
  try {
    const listRes = await fetch('/api/license/list', {
      headers: buildAuthHeaders()
    });
    if (listRes.ok) {
      const licenses = await listRes.json();
      if (Array.isArray(licenses)) {
        return {
          success: true,
          syncedCount: licenses.length,
          failedCount: 0,
          licenses
        };
      }
    }
  } catch (err) {
    console.warn('Notice reading licenses from Supabase:', err);
  }

  return { success: false, syncedCount: 0, failedCount: 0, licenses: [] };
}
