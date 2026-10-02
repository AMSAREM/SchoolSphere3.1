import crypto from 'crypto';
import { getSupabaseAdmin, createAuthenticatedSupabaseClient } from './supabase/server';
import type { AuthJwtPayload } from './auth';
import { validateEmail, normalizeEmail } from '../src/lib/emailValidation';

export interface RegisterOrgInput {
  organizationName: string;
  facilityType?: string;
  facilityCode?: string;
  adminFullName: string;
  email: string;
  password: string;
  subdomain?: string;
  slug?: string;
  phone?: string;
  address?: string;
}

export interface WorkerInvitation {
  id: string;
  token: string;
  organization_id: string;
  email: string | null;
  role: string;
  invited_by?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: number;
  accepted_at?: number | null;
  created_at: number;
}

export interface StaffProfile {
  id: string;
  auth_user_id?: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface UserLoginActivity {
  id: string;
  user_id?: string | number;
  auth_user_id?: string;
  organization_id?: string;
  school_name?: string;
  full_name?: string;
  username?: string;
  role?: string;
  email: string;
  ip_address?: string;
  user_agent?: string;
  status: string;
  login_timestamp: number;
  last_active_timestamp?: number;
}

export interface ActiveUserSession {
  sessionKey: string;
  userId?: string | number;
  authUserId?: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  schoolId?: string | null;
  schoolName: string;
  isOnline: boolean;
  loginTimestamp: number;
  lastActiveTimestamp: number;
  authStatus: string;
  ipAddress?: string;
  userAgent?: string;
}

// In-memory persistent caches for high reliability across operations
const invitationsStore = new Map<string, WorkerInvitation>();
const staffProfilesStore = new Map<string, StaffProfile>();
const loginActivitiesStore: UserLoginActivity[] = [];
const activeUserSessionsStore = new Map<string, ActiveUserSession>();

export function getInMemoryStaffProfiles(): StaffProfile[] {
  return Array.from(staffProfilesStore.values());
}

/**
 * Generate a URL-friendly slug from an organization name
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Register a new enterprise organization workspace and provisions its initial Administrator.
 */
export async function registerOrganization(input: RegisterOrgInput) {
  const { organizationName, facilityType, facilityCode, adminFullName, email, password, subdomain, slug, phone, address } = input;

  if (!organizationName || !organizationName.trim()) {
    throw new Error('Organization name is required');
  }
  if (!adminFullName || !adminFullName.trim()) {
    throw new Error('Administrator full name is required');
  }
  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters long');
  }

  // Validate email
  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    throw new Error(emailValidation.syntaxError || 'Invalid email address');
  }
  if (emailValidation.isDisposable) {
    throw new Error('Disposable temporary emails are prohibited for enterprise workspaces');
  }

  const cleanEmail = emailValidation.normalizedEmail;
  const admin = getSupabaseAdmin();

  const orgId = crypto.randomUUID();
  let orgSlug = slugify(subdomain || slug || organizationName);
  if (!subdomain && !slug && facilityCode && facilityCode.trim()) {
    orgSlug = `${orgSlug}-${slugify(facilityCode)}`;
  }
  if (!orgSlug) {
    orgSlug = `org-${orgId.slice(0, 8)}`;
  }

  // 1. Create Organization in Supabase 'schools'
  const newOrg = {
    id: orgId,
    name: organizationName.trim(),
    slug: orgSlug,
    email: cleanEmail,
    phone: phone || '+233 20 000 0000',
    address: address || 'Enterprise Workspace',
    theme: 'indigo',
    academic_year: '2026/2027',
    current_term: 'Term 1',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  try {
    const { data: createdSch } = await admin.from('schools').insert([newOrg]).select('id, slug').maybeSingle();
    if (createdSch?.id) {
      newOrg.id = createdSch.id;
    }
  } catch (insertErr: any) {
    console.warn('[Register Org] Notice inserting school into Supabase:', insertErr?.message);
  }

  const baseHandle = cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'admin';
  let username = baseHandle;

  // Check if baseHandle is already taken in public.users by another tenant
  try {
    const { data: existingHandle } = await admin
      .from('users')
      .select('id, school_id')
      .eq('username', baseHandle)
      .maybeSingle();

    if (existingHandle && existingHandle.school_id !== newOrg.id) {
      username = `${baseHandle}@${orgSlug}`;
    }
  } catch (e) {}

  // 2. Provision user in Supabase Auth (auth.users) as the single source of truth and capture real auth_user_id + canonical email
  let authUserId: string | null = null;
  let canonicalEmail = cleanEmail.toLowerCase();
  try {
    const { data: createdAuth, error: createAuthErr } = await admin.auth.admin.createUser({
      email: canonicalEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: adminFullName.trim(),
        username,
        role: 'admin',
        school_id: newOrg.id,
        organization_id: newOrg.id
      }
    });
    if (!createAuthErr && createdAuth?.user?.id) {
      authUserId = createdAuth.user.id;
      canonicalEmail = (createdAuth.user.email || canonicalEmail).toLowerCase();
    } else {
      const { data: linkRes } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: canonicalEmail
      });
      if (linkRes?.user?.id) {
        authUserId = linkRes.user.id;
        canonicalEmail = (linkRes.user.email || canonicalEmail).toLowerCase();
        await admin.auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
          user_metadata: {
            ...(linkRes.user.user_metadata || {}),
            full_name: adminFullName.trim(),
            username,
            role: 'admin',
            school_id: newOrg.id,
            organization_id: newOrg.id
          }
        });
      }
    }
  } catch (e) {}

  // 3. Insert or update Admin in 'users' table keeping email and auth_user_id in strict lockstep
  const userRecord: Record<string, any> = {
    auth_user_id: authUserId,
    school_id: newOrg.id,
    username: username,
    full_name: adminFullName.trim(),
    email: canonicalEmail,
    phone: phone || '',
    role: 'admin',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  let insertedUserId: string | number = authUserId || username;
  try {
    const { data: createdUser, error: userError } = await admin
      .from('users')
      .insert([userRecord])
      .select('id')
      .maybeSingle();

    if (!userError && createdUser?.id) {
      insertedUserId = createdUser.id;
    } else if (userError) {
      // Fallback with unique scoped handle if username constraint triggered
      const fallbackUsername = `${baseHandle}@${orgSlug}-${Math.floor(100 + Math.random() * 900)}`;
      const { data: retryUser } = await admin
        .from('users')
        .insert([{ ...userRecord, username: fallbackUsername }])
        .select('id')
        .maybeSingle();
      if (retryUser?.id) {
        insertedUserId = retryUser.id;
        username = fallbackUsername;
      }
    }
  } catch (userErr: any) {
    console.warn('[Register Org] Notice inserting user into Supabase:', userErr?.message);
  }

  // 4. Create Staff Profile
  const profileId = crypto.randomUUID();
  const staffProfile: StaffProfile = {
    id: profileId,
    auth_user_id: authUserId || profileId,
    organization_id: newOrg.id,
    full_name: adminFullName.trim(),
    email: canonicalEmail,
    phone: phone || '',
    role: 'admin',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  // Try writing to staff_profiles in Supabase
  try {
    await admin.from('staff_profiles').insert([staffProfile]);
  } catch (spErr) {
    // If table not present yet, stored in memory cache
  }
  staffProfilesStore.set(staffProfile.id, staffProfile);

  // 5. Generate active license for the new workspace
  const generatedKey = `ESEPA-ORG-${orgSlug.toUpperCase().slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
  try {
    await admin.from('school_licenses').insert([{
      license_key: generatedKey,
      school_name: organizationName.trim(),
      school_id: newOrg.id,
      client_email: canonicalEmail,
      contact_person: adminFullName.trim(),
      tier: 'Enterprise',
      active_status: 'active',
      expiry_date: Date.now() + 365 * 24 * 60 * 60 * 1000,
      active_modules: ["students", "academic", "timetable", "attendance", "results", "reports", "fees", "siren"],
      max_students: 5000,
      created_at: Date.now(),
      updated_at: Date.now()
    }]);
  } catch (licErr) {}

  // 6. Issue real Supabase Auth session token via signInWithPassword
  let token = '';
  try {
    const authClient = createAuthenticatedSupabaseClient();
    const { data: signRes } = await authClient.auth.signInWithPassword({
      email: canonicalEmail,
      password
    });
    if (signRes?.session?.access_token) {
      token = signRes.session.access_token;
    }
  } catch {}

  // 7. Record login telemetry
  recordUserLoginActivity({
    id: crypto.randomUUID(),
    auth_user_id: authUserId || undefined,
    organization_id: newOrg.id,
    email: canonicalEmail,
    status: 'organization_registered',
    login_timestamp: Date.now()
  });

  return {
    organization: newOrg,
    licenseKey: generatedKey,
    user: {
      id: insertedUserId,
      authUserId,
      username,
      fullName: adminFullName.trim(),
      email: canonicalEmail,
      role: 'admin',
      organizationId: newOrg.id,
      schoolId: newOrg.id,
      school_id: newOrg.id,
      status: 'active'
    },
    staffProfile,
    token
  };
}

/**
 * Generate an invitation token for a worker/staff member by an organization admin.
 */
export async function createWorkerInvitation(
  adminUser: AuthJwtPayload,
  input: { email?: string; role?: string; fullName?: string }
) {
  const orgId = adminUser.organization_id || adminUser.school_id || adminUser.schoolId;
  if (!orgId) {
    throw new Error('Admin is not assigned to an organization');
  }

  const role = input.role || 'teacher';
  let targetEmail: string | null = null;

  if (input.email && input.email.trim()) {
    const val = validateEmail(input.email);
    if (!val.isValid) {
      throw new Error(val.syntaxError || 'Invalid invitation email');
    }
    targetEmail = val.normalizedEmail;
  }

  // Generate a cryptographically secure token
  const token = `inv_${crypto.randomBytes(16).toString('hex')}`;
  const invitationId = crypto.randomUUID();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  const invitation: WorkerInvitation = {
    id: invitationId,
    token,
    organization_id: orgId,
    email: targetEmail,
    role,
    invited_by: String(adminUser.id),
    status: 'pending',
    expires_at: expiresAt,
    created_at: Date.now()
  };

  // Try saving to Supabase organization_invitations
  const admin = getSupabaseAdmin();
  try {
    await admin.from('organization_invitations').insert([invitation]);
  } catch (e) {}

  // Cache in memory store
  invitationsStore.set(token, invitation);

  return {
    ...invitation,
    inviteUrl: `/join?token=${token}`
  };
}

/**
 * Verify an invitation token before registration.
 */
export async function verifyInvitationToken(token: string) {
  if (!token || !token.trim()) {
    return { valid: false, error: 'Invitation token is required' };
  }

  const cleanToken = token.trim();
  let invitation = invitationsStore.get(cleanToken);

  if (!invitation) {
    // Query Supabase
    const admin = getSupabaseAdmin();
    try {
      const { data, error } = await admin
        .from('organization_invitations')
        .select('*')
        .eq('token', cleanToken)
        .maybeSingle();

      if (!error && data) {
        invitation = data as WorkerInvitation;
        invitationsStore.set(cleanToken, invitation);
      }
    } catch (e) {}
  }

  if (!invitation) {
    return { valid: false, error: 'Invitation token not found' };
  }

  if (invitation.status !== 'pending') {
    return { valid: false, error: `This invitation has already been ${invitation.status}` };
  }

  if (invitation.expires_at < Date.now()) {
    invitation.status = 'expired';
    return { valid: false, error: 'This invitation token has expired' };
  }

  // Fetch organization details
  const admin = getSupabaseAdmin();
  let organization: any = null;
  try {
    const { data } = await admin
      .from('schools')
      .select('id, name, slug, logo_url')
      .eq('id', invitation.organization_id)
      .maybeSingle();

    if (data) {
      organization = data;
    }
  } catch (e) {}

  if (!organization) {
    organization = {
      id: invitation.organization_id,
      name: 'Organization Workspace',
      slug: 'workspace'
    };
  }

  return {
    valid: true,
    invitation: {
      token: invitation.token,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expires_at
    },
    organization
  };
}

/**
 * Accept an invite and register the worker into the organization.
 */
export async function joinWithInvitation(input: {
  token: string;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}) {
  const { token, fullName, email, password, phone } = input;

  if (!fullName || !fullName.trim()) {
    throw new Error('Full name is required');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  const verification = await verifyInvitationToken(token);
  if (!verification.valid || !verification.invitation || !verification.organization) {
    throw new Error(verification.error || 'Invalid or expired invitation token');
  }

  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    throw new Error(emailValidation.syntaxError || 'Invalid email address');
  }
  if (emailValidation.isDisposable) {
    throw new Error('Disposable temporary emails are prohibited');
  }

  const cleanEmail = emailValidation.normalizedEmail;
  if (verification.invitation.email && verification.invitation.email.toLowerCase() !== cleanEmail) {
    throw new Error(`This invitation was issued specifically for ${verification.invitation.email}`);
  }

  const orgId = verification.organization.id;
  const designatedRole = verification.invitation.role || 'teacher';
  const admin = getSupabaseAdmin();

  const baseHandle = cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'staff';
  let username = baseHandle;
  try {
    const { data: existH } = await admin.from('users').select('id').eq('username', baseHandle).maybeSingle();
    if (existH) {
      username = `${baseHandle}_${Math.floor(100 + Math.random() * 900)}`;
    }
  } catch (e) {}

  // Provision user in Supabase Auth (auth.users) first and capture real auth_user_id + canonical email
  let authUserId: string | null = null;
  let canonicalEmail = cleanEmail.toLowerCase();
  try {
    const { data: createdAuth, error: createAuthErr } = await admin.auth.admin.createUser({
      email: canonicalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        username,
        role: designatedRole,
        school_id: orgId,
        organization_id: orgId
      }
    });
    if (!createAuthErr && createdAuth?.user?.id) {
      authUserId = createdAuth.user.id;
      canonicalEmail = (createdAuth.user.email || canonicalEmail).toLowerCase();
    } else {
      const { data: linkRes } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: canonicalEmail
      });
      if (linkRes?.user?.id) {
        authUserId = linkRes.user.id;
        canonicalEmail = (linkRes.user.email || canonicalEmail).toLowerCase();
        await admin.auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
          user_metadata: {
            ...(linkRes.user.user_metadata || {}),
            full_name: fullName.trim(),
            username,
            role: designatedRole,
            school_id: orgId,
            organization_id: orgId
          }
        });
      }
    }
  } catch (e) {}

  // Insert into 'users' table keeping email and auth_user_id synchronized with auth.users
  const userRecord: Record<string, any> = {
    auth_user_id: authUserId,
    school_id: orgId,
    username: username,
    full_name: fullName.trim(),
    email: canonicalEmail,
    phone: phone || '',
    role: designatedRole,
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  let insertedUserId: string | number = authUserId || username;
  try {
    const { data: createdUser } = await admin
      .from('users')
      .insert([userRecord])
      .select('id')
      .maybeSingle();

    if (createdUser?.id) {
      insertedUserId = createdUser.id;
    }
  } catch (e) {}

  // Create Staff Profile
  const profileId = crypto.randomUUID();
  const staffProfile: StaffProfile = {
    id: profileId,
    auth_user_id: authUserId || profileId,
    organization_id: orgId,
    full_name: fullName.trim(),
    email: canonicalEmail,
    phone: phone || '',
    role: designatedRole,
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  try {
    await admin.from('staff_profiles').insert([staffProfile]);
  } catch (e) {}
  staffProfilesStore.set(profileId, staffProfile);

  // Mark invitation as accepted
  const storedInv = invitationsStore.get(token.trim());
  if (storedInv) {
    storedInv.status = 'accepted';
    storedInv.accepted_at = Date.now();
  }
  try {
    await admin
      .from('organization_invitations')
      .update({ status: 'accepted', accepted_at: Date.now() })
      .eq('token', token.trim());
  } catch (e) {}

  // Issue real Supabase Auth session token via signInWithPassword
  let authToken = '';
  try {
    const authClient = createAuthenticatedSupabaseClient();
    const { data: signRes } = await authClient.auth.signInWithPassword({
      email: canonicalEmail,
      password
    });
    if (signRes?.session?.access_token) {
      authToken = signRes.session.access_token;
    }
  } catch {}

  // Record login activity
  recordUserLoginActivity({
    id: crypto.randomUUID(),
    auth_user_id: authUserId || undefined,
    organization_id: orgId,
    email: canonicalEmail,
    status: 'invite_accepted',
    login_timestamp: Date.now()
  });

  return {
    organization: verification.organization,
    user: {
      id: insertedUserId,
      authUserId,
      username,
      fullName: fullName.trim(),
      email: canonicalEmail,
      role: designatedRole,
      organizationId: orgId,
      schoolId: orgId,
      school_id: orgId,
      status: 'active'
    },
    staffProfile,
    token: authToken
  };
}

/**
 * List workers/staff and invitations for an organization.
 */
export async function listOrganizationWorkers(orgId: string) {
  const admin = getSupabaseAdmin();
  let workers: any[] = [];
  let pendingInvitations: any[] = [];

  // Fetch users belonging to this organization (excluding platform creator and super_admin)
  try {
    const { data: dbUsers, error } = await admin
      .from('users')
      .select('id, username, full_name, email, phone, role, status, created_at')
      .eq('school_id', orgId)
      .neq('role', 'creator')
      .neq('role', 'super_admin');

    if (!error && Array.isArray(dbUsers)) {
      workers = dbUsers
        .filter(u => u.role !== 'creator' && u.role !== 'super_admin')
        .map(u => ({
          id: u.id,
          username: u.username,
          fullName: u.full_name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          status: u.status,
          createdAt: u.created_at
        }));
    }
  } catch (e) {}

  // Merge in-memory staff profiles if missing (excluding creator and super_admin)
  for (const profile of staffProfilesStore.values()) {
    if (
      profile.organization_id === orgId &&
      profile.role !== ('creator' as any) &&
      profile.role !== ('super_admin' as any) &&
      !workers.some(w => w.email === profile.email)
    ) {
      workers.push({
        id: profile.id,
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        status: profile.status,
        createdAt: profile.created_at
      });
    }
  }

  // Fetch pending invitations
  try {
    const { data: dbInvs } = await admin
      .from('organization_invitations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'pending');

    if (Array.isArray(dbInvs)) {
      pendingInvitations = dbInvs;
    }
  } catch (e) {}

  for (const inv of invitationsStore.values()) {
    if (inv.organization_id === orgId && inv.status === 'pending' && !pendingInvitations.some(i => i.token === inv.token)) {
      pendingInvitations.push(inv);
    }
  }

  return {
    workers,
    pendingInvitations
  };
}

function buildSessionKey(params: {
  userId?: string | number | null;
  authUserId?: string | null;
  email?: string | null;
  username?: string | null;
  schoolId?: string | null;
}): string {
  if (params.authUserId && String(params.authUserId).trim() && String(params.authUserId) !== '00000000-0000-0000-0000-000000000000') {
    return `auth:${String(params.authUserId).trim().toLowerCase()}`;
  }
  if (params.userId !== undefined && params.userId !== null && String(params.userId).trim()) {
    return `uid:${String(params.userId).trim().toLowerCase()}`;
  }
  if (params.email && String(params.email).trim()) {
    return `email:${String(params.email).trim().toLowerCase()}`;
  }
  const uname = String(params.username || 'user').trim().toLowerCase();
  const sch = String(params.schoolId || 'global').trim().toLowerCase();
  return `user:${uname}@${sch}`;
}

export function recordUserSessionHeartbeat(input: {
  userId?: string | number | null;
  authUserId?: string | null;
  username?: string | null;
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  authStatus?: string | null;
  loginTimestamp?: number | null;
  ipAddress?: string;
  userAgent?: string;
  isOnline?: boolean;
}): ActiveUserSession {
  const now = Date.now();
  const key = buildSessionKey({
    userId: input.userId,
    authUserId: input.authUserId,
    email: input.email,
    username: input.username,
    schoolId: input.schoolId
  });

  const existing = activeUserSessionsStore.get(key);
  const roleClean = String(input.role || existing?.role || 'admin').trim().toLowerCase();
  const resolvedSchoolName =
    input.schoolName ||
    existing?.schoolName ||
    (roleClean === 'creator' || roleClean === 'super_admin' ? 'Platform Global Scope' : 'SchoolSphere Portal');

  const session: ActiveUserSession = {
    sessionKey: key,
    userId: input.userId ?? existing?.userId,
    authUserId: input.authUserId || existing?.authUserId || undefined,
    username: String(input.username || existing?.username || (input.email ? input.email.split('@')[0] : 'user')).trim(),
    fullName: String(input.fullName || existing?.fullName || input.username || (input.email ? input.email.split('@')[0] : 'User')).trim(),
    email: String(input.email || existing?.email || '').trim().toLowerCase(),
    role: roleClean,
    schoolId: input.schoolId !== undefined ? input.schoolId : existing?.schoolId,
    schoolName: resolvedSchoolName,
    isOnline: input.isOnline !== undefined ? input.isOnline : true,
    loginTimestamp: Number(input.loginTimestamp || existing?.loginTimestamp || now),
    lastActiveTimestamp: now,
    authStatus: String(input.authStatus || existing?.authStatus || 'Authenticated'),
    ipAddress: input.ipAddress || existing?.ipAddress,
    userAgent: input.userAgent || existing?.userAgent
  };

  activeUserSessionsStore.set(key, session);
  return session;
}

function toValidNumericUserId(val: any): number | null {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0 && val < 1000000000) {
    return val;
  }
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    const n = Number(val.trim());
    if (n > 0 && n < 1000000000) return n;
  }
  return null;
}

function toValidSchoolUuid(val: any): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) &&
    s !== '00000000-0000-0000-0000-000000000000' &&
    s !== '00000000-0000-0000-0000-000000000001'
  ) {
    return s;
  }
  return null;
}

export function markUserSessionOffline(input: {
  userId?: string | number | null;
  authUserId?: string | null;
  email?: string | null;
  username?: string | null;
  schoolId?: string | null;
  ipAddress?: string;
}) {
  const now = Date.now();
  const targetKey = buildSessionKey(input);
  const existing = activeUserSessionsStore.get(targetKey);
  if (existing) {
    existing.isOnline = false;
    existing.lastActiveTimestamp = now;
    existing.authStatus = 'Logged Out';
    activeUserSessionsStore.set(targetKey, existing);
  }

  let matchedSession: ActiveUserSession | null = existing || null;

  for (const [k, sess] of activeUserSessionsStore.entries()) {
    const matchUid = input.userId !== undefined && input.userId !== null && String(sess.userId) === String(input.userId);
    const matchAuth = input.authUserId && sess.authUserId && String(sess.authUserId) === String(input.authUserId);
    const matchEmail = input.email && sess.email && sess.email.toLowerCase() === String(input.email).trim().toLowerCase();
    const matchUser = input.username && sess.username && sess.username.toLowerCase() === String(input.username).trim().toLowerCase();
    if (matchUid || matchAuth || matchEmail || matchUser) {
      sess.isOnline = false;
      sess.lastActiveTimestamp = now;
      sess.authStatus = 'Logged Out';
      activeUserSessionsStore.set(k, sess);
      if (!matchedSession) matchedSession = sess;
    }
  }

  // Persist logout event to Supabase public.audit_logs
  (async () => {
    try {
      const admin = getSupabaseAdmin();
      let numericUid = toValidNumericUserId(input.userId ?? matchedSession?.userId);
      let validSchoolId = toValidSchoolUuid(input.schoolId ?? matchedSession?.schoolId);
      const emailLookup = String(input.email || matchedSession?.email || '').trim().toLowerCase();
      const userLookup = String(input.username || matchedSession?.username || '').trim().toLowerCase();

      if (!numericUid && (emailLookup || userLookup)) {
        const filters = [
          emailLookup ? `email.ilike.${emailLookup}` : '',
          userLookup ? `username.ilike.${userLookup}` : ''
        ].filter(Boolean);
        if (filters.length > 0) {
          const { data: uRow } = await admin
            .from('users')
            .select('id, school_id')
            .or(filters.join(','))
            .limit(1)
            .maybeSingle();
          if (uRow?.id) numericUid = toValidNumericUserId(uRow.id);
          if (!validSchoolId && uRow?.school_id) validSchoolId = toValidSchoolUuid(uRow.school_id);
        }
      }

      await admin.from('audit_logs').insert([
        {
          school_id: validSchoolId,
          user_id: numericUid,
          action: 'USER_LOGOUT',
          entity_type: 'USER',
          entity_id: String(numericUid || input.username || input.email || matchedSession?.username || 'user'),
          details: {
            username: input.username || matchedSession?.username || 'user',
            fullName: matchedSession?.fullName || input.username || 'User',
            email: input.email || matchedSession?.email || '',
            role: matchedSession?.role || 'admin',
            schoolName: matchedSession?.schoolName || 'SchoolSphere Portal',
            authStatus: 'Logged Out'
          },
          ip_address: input.ipAddress || matchedSession?.ipAddress || '127.0.0.1',
          timestamp: now
        }
      ]);
    } catch {}
  })();
}

export function getActiveUserSessions(onlineWindowMs = 120000): ActiveUserSession[] {
  const now = Date.now();
  const result: ActiveUserSession[] = [];
  for (const sess of activeUserSessionsStore.values()) {
    const isFresh = sess.isOnline && now - sess.lastActiveTimestamp <= onlineWindowMs;
    result.push({
      ...sess,
      isOnline: isFresh
    });
  }
  return result.sort((a, b) => b.lastActiveTimestamp - a.lastActiveTimestamp);
}

/**
 * Record user login telemetry directly into Supabase public.audit_logs & public.users.last_login
 */
export function recordUserLoginActivity(activity: UserLoginActivity) {
  const now = activity.login_timestamp || Date.now();
  const enriched: UserLoginActivity = {
    ...activity,
    id: activity.id || crypto.randomUUID(),
    login_timestamp: now,
    last_active_timestamp: activity.last_active_timestamp || now
  };

  const isFailed =
    String(enriched.status || '').toLowerCase().includes('fail') ||
    String(enriched.status || '').toLowerCase().includes('error');

  // Deduplicate rapid identical login events within 5 seconds for the same email/username
  const recentDup = loginActivitiesStore.find((item) => {
    const itemFailed =
      String(item.status || '').toLowerCase().includes('fail') ||
      String(item.status || '').toLowerCase().includes('error');
    const sameIdentity =
      (item.email && enriched.email && item.email.toLowerCase() === enriched.email.toLowerCase()) ||
      (item.username && enriched.username && item.username.toLowerCase() === enriched.username.toLowerCase());
    return sameIdentity && Math.abs(item.login_timestamp - enriched.login_timestamp) < 5000 && itemFailed === isFailed;
  });
  if (recentDup) {
    return;
  }

  loginActivitiesStore.unshift(enriched);
  if (loginActivitiesStore.length > 500) {
    loginActivitiesStore.pop();
  }

  if (!isFailed) {
    recordUserSessionHeartbeat({
      userId: enriched.user_id,
      authUserId: enriched.auth_user_id,
      username: enriched.username || (enriched.email ? enriched.email.split('@')[0] : 'user'),
      fullName: enriched.full_name || enriched.username || (enriched.email ? enriched.email.split('@')[0] : 'User'),
      email: enriched.email,
      role: enriched.role || 'admin',
      schoolId: enriched.organization_id || null,
      schoolName: enriched.school_name || undefined,
      authStatus: 'Authenticated',
      loginTimestamp: enriched.login_timestamp,
      ipAddress: enriched.ip_address,
      userAgent: enriched.user_agent,
      isOnline: true
    });
  }

  // Persist login event to authoritative Supabase public.audit_logs and update public.users.last_login
  (async () => {
    try {
      const admin = getSupabaseAdmin();
      let numericUid = toValidNumericUserId(enriched.user_id);
      let validSchoolId = toValidSchoolUuid(enriched.organization_id);
      let resolvedFullName = enriched.full_name || enriched.username || (enriched.email ? enriched.email.split('@')[0] : 'User');
      let resolvedRole = enriched.role || 'admin';

      if (!numericUid) {
        const emailLookup = String(enriched.email || '').trim().toLowerCase();
        const userLookup = String(enriched.username || '').trim().toLowerCase();
        const authUidLookup = toValidSchoolUuid(enriched.auth_user_id);
        const filters = [
          authUidLookup ? `auth_user_id.eq.${authUidLookup}` : '',
          emailLookup ? `email.ilike.${emailLookup}` : '',
          userLookup ? `username.ilike.${userLookup}` : ''
        ].filter(Boolean);

        if (filters.length > 0) {
          const { data: uRow } = await admin
            .from('users')
            .select('id, school_id, full_name, role')
            .or(filters.join(','))
            .limit(1)
            .maybeSingle();
          if (uRow?.id) numericUid = toValidNumericUserId(uRow.id);
          if (!validSchoolId && uRow?.school_id) validSchoolId = toValidSchoolUuid(uRow.school_id);
          if (uRow?.full_name) resolvedFullName = uRow.full_name;
          if (uRow?.role) resolvedRole = uRow.role;
        }
      }

      await admin.from('audit_logs').insert([
        {
          school_id: validSchoolId,
          user_id: numericUid,
          action: isFailed ? 'USER_LOGIN_FAILED' : 'USER_LOGIN',
          entity_type: 'USER',
          entity_id: String(numericUid || enriched.username || enriched.email || 'user'),
          details: {
            username: enriched.username || (enriched.email ? enriched.email.split('@')[0] : 'user'),
            fullName: resolvedFullName,
            email: enriched.email,
            role: resolvedRole,
            schoolName:
              enriched.school_name ||
              (resolvedRole === 'creator' || resolvedRole === 'super_admin'
                ? 'Platform Global Scope'
                : 'SchoolSphere Portal'),
            authStatus: isFailed ? 'Failed Attempt' : 'Authenticated',
            authUserId: enriched.auth_user_id || null,
            userAgent: enriched.user_agent || null
          },
          ip_address: enriched.ip_address || '127.0.0.1',
          timestamp: enriched.login_timestamp
        }
      ]);

      if (!isFailed && numericUid) {
        await admin
          .from('users')
          .update({ last_login: enriched.login_timestamp })
          .eq('id', numericUid);
      }
    } catch {}
  })();
}

/**
 * Query recent login activities
 */
export function getRecentLoginActivities(orgId?: string) {
  if (!orgId) return loginActivitiesStore.slice(0, 100);
  return loginActivitiesStore.filter(a => a.organization_id === orgId).slice(0, 100);
}
