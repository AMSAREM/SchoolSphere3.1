export interface LicenseRecord {
  key: string;
  license_id?: number | null;
  schoolName: string;
  school_id?: string | null;
  tier: string;
  durationMonths: string;
  expiryDate: number | null;
  createdAt: number;
  activatedAt?: number | null;
  used?: boolean;
  status: 'active' | 'suspended' | 'expired' | 'revoked';
  syncStatus: 'synced' | 'local_only' | 'sync_failed';
  syncError?: string | null;
  activeModules?: string[];
  [key: string]: any;
}

const LEGACY_STORAGE_KEYS = [
  'esepa_generated_licenses',
  'esepa_cached_tenants'
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

export function getStoredLicenses(): LicenseRecord[] {
  purgeLegacyLicenseCaches();
  return [];
}

export function saveStoredLicenses(_licenses: LicenseRecord[]): void {
  purgeLegacyLicenseCaches();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('esepa_licenses_updated'));
  }
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
    const listRes = await fetch('/api/license/list');
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

