import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getEnvVar(name: string): string {
  if (process.env[name] && process.env[name]?.trim()) {
    return process.env[name]!.trim();
  }
  return '';
}

export function getSupabaseAdmin() {
  const supabaseUrl = getEnvVar('SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL') || getEnvVar('NEXT_PUBLIC_SUPABASE_URL') || 'https://niavmonyfwqlryppgksy.supabase.co';

  const targetRef = supabaseUrl.replace(/^https?:\/\//, '').split('.')[0];
  const matchingKey = getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pYXZtb255ZndxbHJ5cHBna3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTg3MDIsImV4cCI6MjEwMTI3NDcwMn0.JtZL7wwDN48z6_8K5uK-RYK3CKNQx8a6N4Rfh50hX_U';
  let serviceRoleKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('SUPABASE_SECRET_KEY') || matchingKey;

  // Verify that key matches target ref if it's a JWT
  if (serviceRoleKey && serviceRoleKey.startsWith('ey')) {
    try {
      const parts = serviceRoleKey.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        if (payload && payload.ref && payload.ref !== targetRef) {
          // If the configured key belongs to a different project ref, fall back to matching key for targetRef
          serviceRoleKey = matchingKey;
        }
      }
    } catch {}
  }

  if (!serviceRoleKey) {
    serviceRoleKey = matchingKey;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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

    // 2. Fallback: Check via SECURITY DEFINER RPC get_schools_directory (read-only)
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

