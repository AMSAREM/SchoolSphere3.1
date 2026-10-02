import { createClient } from '@supabase/supabase-js';
import { AsyncLocalStorage } from 'async_hooks';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_SUPABASE_URL = 'https://niavmonyfwqlryppgksy.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pYXZtb255ZndxbHJ5cHBna3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTg3MDIsImV4cCI6MjEwMTI3NDcwMn0.JtZL7wwDN48z6_8K5uK-RYK3CKNQx8a6N4Rfh50hX_U';

const requestTokenStorage = new AsyncLocalStorage<{ accessToken?: string | null }>();

export function runWithRequestToken<T>(accessToken: string | null | undefined, fn: () => T): T {
  return requestTokenStorage.run({ accessToken: accessToken || null }, fn);
}

export function getCurrentRequestToken(): string | null {
  return requestTokenStorage.getStore()?.accessToken || null;
}

function getEnvVar(name: string): string {
  if (process.env[name] && process.env[name]?.trim()) {
    return process.env[name]!.trim().replace(/^[A-Z0-9_]+=/, '').trim();
  }
  return '';
}

export function getSupabaseUrlStrict(): string {
  const supabaseUrl =
    getEnvVar('SUPABASE_URL') ||
    getEnvVar('VITE_SUPABASE_URL') ||
    getEnvVar('NEXT_PUBLIC_SUPABASE_URL') ||
    DEFAULT_SUPABASE_URL;

  return supabaseUrl;
}

let cachedCreatorSession: { accessToken: string; expiresAt: number } | null = null;

export function getSupabaseAdmin() {
  const supabaseUrl = getSupabaseUrlStrict();
  const targetRef = supabaseUrl.replace(/^https?:\/\//, '').split('.')[0];

  const serviceRoleKey =
    getEnvVar('SUPABASE_SERVICE_ROLE_KEY') ||
    getEnvVar('SUPABASE_SECRET_KEY') ||
    getEnvVar('VITE_SUPABASE_SERVICE_ROLE_KEY') ||
    getEnvVar('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');

  let validServiceKey = serviceRoleKey;

  if (validServiceKey && validServiceKey.startsWith('ey')) {
    try {
      const parts = validServiceKey.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        if (payload?.ref && payload.ref !== targetRef) {
          validServiceKey = '';
        }
        if (payload?.role && payload.role === 'anon') {
          validServiceKey = '';
        }
      }
    } catch {}
  }

  if (!validServiceKey) {
    const requestToken = getCurrentRequestToken();
    const fallbackToken =
      requestToken ||
      (cachedCreatorSession && cachedCreatorSession.expiresAt > Date.now()
        ? cachedCreatorSession.accessToken
        : null);
    return createAuthenticatedSupabaseClient(fallbackToken);
  }

  return createClient(supabaseUrl, validServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createAuthenticatedSupabaseClient(accessToken?: string | null) {
  const supabaseUrl = getSupabaseUrlStrict();
  const anonKey =
    getEnvVar('SUPABASE_ANON_KEY') ||
    getEnvVar('VITE_SUPABASE_ANON_KEY') ||
    getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    DEFAULT_SUPABASE_ANON_KEY;

  const effectiveToken = accessToken !== undefined ? accessToken : getCurrentRequestToken();

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...(effectiveToken
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${effectiveToken}`,
            },
          },
        }
      : {}),
  });
}

export async function getCreatorAuthenticatedClient() {
  const now = Date.now();
  if (cachedCreatorSession && cachedCreatorSession.expiresAt > now + 60_000) {
    return createAuthenticatedSupabaseClient(cachedCreatorSession.accessToken);
  }

  const admin = getSupabaseAdmin();
  const candidateCreatorEmails = Array.from(
    new Set([getEnvVar('CREATOR_EMAIL'), 'creator@schoolsphere.app'].filter(Boolean))
  );

  for (const creatorEmail of candidateCreatorEmails) {
    try {
      if (admin.auth?.admin?.generateLink) {
        const linkRes = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: creatorEmail,
        });

        const hashedToken = linkRes.data?.properties?.hashed_token;
        if (hashedToken) {
          const tempClient = createAuthenticatedSupabaseClient(null);
          const otpRes = await tempClient.auth.verifyOtp({
            token_hash: hashedToken,
            type: 'magiclink',
          });
          if (otpRes.data?.session?.access_token) {
            cachedCreatorSession = {
              accessToken: otpRes.data.session.access_token,
              expiresAt: now + ((otpRes.data.session.expires_in || 3600) * 1000),
            };
            return createAuthenticatedSupabaseClient(cachedCreatorSession.accessToken);
          }
        }
      }
    } catch {}
  }

  return admin;
}

export async function getOrCreateSchoolBySlugOrName(schoolName: string, licenseKey?: string) {
  const cleanName = (schoolName || '').trim();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'default-school';

  try {
    const admin = getSupabaseAdmin();

    // 1. Check if school exists via direct table query (read-only)
    const { data: existing } = await admin
      .from('schools')
      .select('*')
      .or(`slug.eq.${slug},name.ilike.${cleanName}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // 2. Fallback: Check via SECURITY DEFINER RPC get_schools_directory (service_role)
    try {
      const { data: dirSchools } = await admin.rpc('get_schools_directory');
      if (Array.isArray(dirSchools) && dirSchools.length > 0) {
        const matched = dirSchools.find((s: any) =>
          String(s.slug || '').toLowerCase() === slug ||
          String(s.name || '').trim().toLowerCase() === cleanName.toLowerCase() ||
          (licenseKey && String(s.license_key || '').trim().toUpperCase() === licenseKey.trim().toUpperCase())
        );
        if (matched) {
          return {
            id: matched.id,
            name: matched.name,
            slug: matched.slug || slug,
            email: matched.email || `contact@${matched.slug || slug}.edu`,
            phone: matched.phone || '',
            address: matched.address || 'Ghana',
            status: String(matched.status || 'active').toLowerCase()
          };
        }
      }
    } catch {}
  } catch (err: any) {
    console.warn('Notice in getOrCreateSchoolBySlugOrName:', err.message);
  }

  return null;
}
