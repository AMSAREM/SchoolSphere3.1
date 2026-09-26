import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from './supabase/server';
import { generateAuthToken, AuthJwtPayload } from './auth';
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
  password_hash?: string;
  created_at: number;
  updated_at: number;
}

export interface UserLoginActivity {
  id: string;
  auth_user_id?: string;
  organization_id?: string;
  email: string;
  ip_address?: string;
  user_agent?: string;
  status: string;
  login_timestamp: number;
}

// In-memory persistent caches for high reliability across operations
const invitationsStore = new Map<string, WorkerInvitation>();
const staffProfilesStore = new Map<string, StaffProfile>();
const loginActivitiesStore: UserLoginActivity[] = [];

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

  // 2. Hash admin password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const authUserId = crypto.randomUUID();
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

  // Also create/update in Supabase Auth (auth.users) so email+password login works natively
  try {
    await admin.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: adminFullName.trim(),
        role: 'admin',
        school_id: newOrg.id,
        organization_id: newOrg.id
      }
    });
  } catch (e) {}

  // 3. Insert Admin into 'users' table
  const userRecord = {
    auth_user_id: authUserId,
    school_id: newOrg.id,
    username: username,
    password_hash: passwordHash,
    full_name: adminFullName.trim(),
    email: cleanEmail,
    phone: phone || '',
    role: 'admin',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  let insertedUserId: string | number = authUserId;
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
    auth_user_id: authUserId,
    organization_id: newOrg.id,
    full_name: adminFullName.trim(),
    email: cleanEmail,
    phone: phone || '',
    role: 'admin',
    status: 'active',
    password_hash: passwordHash,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  // Try writing to staff_profiles in Supabase
  try {
    const { password_hash: _ph, ...dbStaffProfile } = staffProfile;
    await admin.from('staff_profiles').insert([dbStaffProfile]);
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
      client_email: cleanEmail,
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

  // 6. Generate authenticated JWT
  const authPayload: Omit<AuthJwtPayload, 'iat' | 'exp'> = {
    id: insertedUserId,
    username: username,
    email: cleanEmail,
    role: 'admin',
    school_id: newOrg.id,
    schoolId: newOrg.id,
    organization_id: newOrg.id,
    fullName: adminFullName.trim()
  };

  const token = generateAuthToken(authPayload);

  // 7. Record login telemetry
  recordUserLoginActivity({
    id: crypto.randomUUID(),
    auth_user_id: authUserId,
    organization_id: newOrg.id,
    email: cleanEmail,
    status: 'organization_registered',
    login_timestamp: Date.now()
  });

  return {
    organization: newOrg,
    licenseKey: generatedKey,
    passwordHash,
    user: {
      id: insertedUserId,
      authUserId,
      username,
      fullName: adminFullName.trim(),
      email: cleanEmail,
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

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const authUserId = crypto.randomUUID();
  const baseHandle = cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'staff';
  let username = baseHandle;
  try {
    const { data: existH } = await admin.from('users').select('id').eq('username', baseHandle).maybeSingle();
    if (existH) {
      username = `${baseHandle}_${Math.floor(100 + Math.random() * 900)}`;
    }
  } catch (e) {}

  // Insert into 'users' table
  const userRecord = {
    auth_user_id: authUserId,
    school_id: orgId,
    username: username,
    password_hash: passwordHash,
    full_name: fullName.trim(),
    email: cleanEmail,
    phone: phone || '',
    role: designatedRole,
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  let insertedUserId: string | number = authUserId;
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
    auth_user_id: authUserId,
    organization_id: orgId,
    full_name: fullName.trim(),
    email: cleanEmail,
    phone: phone || '',
    role: designatedRole,
    status: 'active',
    password_hash: passwordHash,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  try {
    const { password_hash: _ph, ...dbStaffProfile } = staffProfile;
    await admin.from('staff_profiles').insert([dbStaffProfile]);
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

  // Generate JWT token
  const tokenPayload: Omit<AuthJwtPayload, 'iat' | 'exp'> = {
    id: insertedUserId,
    username,
    email: cleanEmail,
    role: designatedRole,
    school_id: orgId,
    schoolId: orgId,
    organization_id: orgId,
    fullName: fullName.trim()
  };

  const authToken = generateAuthToken(tokenPayload);

  // Record login activity
  recordUserLoginActivity({
    id: crypto.randomUUID(),
    auth_user_id: authUserId,
    organization_id: orgId,
    email: cleanEmail,
    status: 'invite_accepted',
    login_timestamp: Date.now()
  });

  return {
    organization: verification.organization,
    passwordHash,
    user: {
      id: insertedUserId,
      authUserId,
      username,
      fullName: fullName.trim(),
      email: cleanEmail,
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

/**
 * Record user login telemetry
 */
export function recordUserLoginActivity(activity: UserLoginActivity) {
  loginActivitiesStore.unshift(activity);
  if (loginActivitiesStore.length > 500) {
    loginActivitiesStore.pop();
  }

  // Attempt to write to Supabase user_login_activities
  const admin = getSupabaseAdmin();
  Promise.resolve(
    admin
      .from('user_login_activities')
      .insert([activity])
  )
    .then(() => {})
    .catch(() => {});
}

/**
 * Query recent login activities
 */
export function getRecentLoginActivities(orgId?: string) {
  if (!orgId) return loginActivitiesStore.slice(0, 50);
  return loginActivitiesStore.filter(a => a.organization_id === orgId).slice(0, 50);
}
