import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

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
    getEnvVar('NEXT_PUBLIC_SUPABASE_URL');

  if (!supabaseUrl) {
    throw new Error(
      'FATAL: SUPABASE_URL (or VITE_SUPABASE_URL) environment variable is not set. Refusing to start without an explicit Supabase project URL.'
    );
  }
  return supabaseUrl;
}

export function getSupabaseAdmin() {
  const supabaseUrl = getSupabaseUrlStrict();
  const targetRef = supabaseUrl.replace(/^https?:\/\//, '').split('.')[0];

  const serviceRoleKey =
    getEnvVar('SUPABASE_SERVICE_ROLE_KEY') ||
    getEnvVar('SUPABASE_SECRET_KEY');

  if (!serviceRoleKey) {
    throw new Error(
      'FATAL: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is not set. Refusing to silently downgrade server admin client to anon.'
    );
  }

  // Verify JWT role & project ref when a JWT key is supplied
  if (serviceRoleKey.startsWith('ey')) {
    try {
      const parts = serviceRoleKey.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        if (payload?.ref && payload.ref !== targetRef) {
          throw new Error(
            `FATAL: SUPABASE_SERVICE_ROLE_KEY project ref "${payload.ref}" does not match target project "${targetRef}".`
          );
        }
        if (payload?.role && payload.role === 'anon') {
          throw new Error(
            'FATAL: SUPABASE_SERVICE_ROLE_KEY contains an "anon" role token. A privileged service_role key is required for server administration.'
          );
        }
      }
    } catch (err: any) {
      if (err?.message?.startsWith('FATAL:')) {
        throw err;
      }
    }
  }

  return createClient(supabaseUrl, serviceRoleKey, {
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
    getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  if (!anonKey) {
    throw new Error(
      'FATAL: SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY is not configured. Cannot initialize Supabase client.'
    );
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...(accessToken
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        }
      : {}),
  });
}

let cachedCreatorSession: { accessToken: string; expiresAt: number } | null = null;

export async function getCreatorAuthenticatedClient() {
  const now = Date.now();
  if (cachedCreatorSession && cachedCreatorSession.expiresAt > now + 60_000) {
    return createAuthenticatedSupabaseClient(cachedCreatorSession.accessToken);
  }

  const admin = getSupabaseAdmin();
  try {
    const creatorEmail = getEnvVar('CREATOR_EMAIL') || 'creator@schoolsphere.app';
    const linkRes = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: creatorEmail,
    });

    const hashedToken = linkRes.data?.properties?.hashed_token;
    if (hashedToken) {
      const tempClient = createAuthenticatedSupabaseClient();
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
  } catch (err: any) {
    console.warn('Notice obtaining creator RLS session:', err?.message);
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
