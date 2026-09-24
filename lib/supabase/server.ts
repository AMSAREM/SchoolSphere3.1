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
  try {
    const admin = getSupabaseAdmin();
    const slug = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').trim() || 'default-school';
    
    // Check if school exists
    const { data: existing } = await admin
      .from('schools')
      .select('*')
      .or(`slug.eq.${slug},name.ilike.${schoolName}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // Insert new school
    const newSchool = {
      name: schoolName,
      slug: slug,
      email: `contact@${slug}.edu`,
      phone: '+233 20 000 0000',
      address: 'Ghana',
      status: 'active'
    };

    const { data: created, error } = await admin
      .from('schools')
      .insert([newSchool])
      .select()
      .single();

    if (!error && created) {
      return created;
    }
  } catch (err: any) {
    console.warn('Notice in getOrCreateSchoolBySlugOrName:', err.message);
  }

  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: schoolName || 'ESEPA INTERNATIONAL SCHOOL',
    slug: 'default-school',
    status: 'active'
  };
}
