import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { db, User, School, clearTenantLocalDatabase, purgeDemoRecordsFromDb } from '../db/schema';
import { supabase } from '../lib/supabase/client';
import { syncTenantAcademicData } from '../lib/api';
import { AppPermission, UserRole, hasPermission as checkPermission, canAccessModule as checkModuleAccess, getRoleInfo } from '../lib/permissions';
import { recordUserLogin, sendSessionHeartbeat, sendSessionLogout, mapAuthErrorMessage } from '../lib/authTelemetry';
import { normalizeEmail } from '../lib/emailValidation';

interface RegisterOrgPayload {
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

interface JoinInvitePayload {
  token: string;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  school: School | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  login: (username: string, password: string, schoolId?: string) => Promise<boolean>;
  handleLogin: (username: string, password: string, schoolId?: string) => Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }>;
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }>;
  registerOrganization: (data: RegisterOrgPayload) => Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }>;
  joinWithInviteToken: (data: JoinInvitePayload) => Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }>;
  logout: () => void;
  register: (username: string, password: string, fullName: string, role: User['role'], email?: string, phone?: string) => Promise<boolean>;
  switchRole: (role: User['role']) => void;
  loadSchoolContext: () => Promise<School | null>;
  setSchoolContext: (school: School) => Promise<void>;
  hasPermission: (permission: AppPermission) => boolean;
  canAccessModule: (moduleId: string, activeLicenseModules?: string[]) => boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshSession: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ success: boolean; error?: string; magicLinkUrl?: string; emailOtpCode?: string }>;
  verifyOtp: (email: string, token: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('esepa_auth_token'));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem('esepa_refresh_token'));
  const [isLoading, setIsLoading] = useState(true);

  const setSchoolContext = async (targetSchool: School) => {
    if (!targetSchool) return;
    const prevSchoolId = localStorage.getItem('esepa_active_school_id');
    if (targetSchool.id && prevSchoolId && prevSchoolId !== targetSchool.id) {
      await clearTenantLocalDatabase(targetSchool.id);
    }
    if (targetSchool.id) {
      localStorage.setItem('esepa_active_school_id', targetSchool.id);
      await purgeDemoRecordsFromDb(targetSchool.id);
    }
    setSchool(targetSchool);
    localStorage.setItem('esepa_active_school', JSON.stringify(targetSchool));

    try {
      const existing = await db.settings.where('key').equals('schoolProfile').first();
      const profileData = {
        schoolName: targetSchool.name || (targetSchool as any).schoolName || 'SchoolSphere Portal',
        logo: targetSchool.logo_url || (targetSchool as any).logo || '/sch sphere logo1.png',
        theme: targetSchool.theme || 'indigo',
        email: targetSchool.email || '',
        phone: targetSchool.phone || '',
        address: targetSchool.address || '',
        academicYear: targetSchool.academic_year || '2026/2027',
        currentTerm: targetSchool.current_term || 'Term 1'
      };

      if (existing && existing.id) {
        await db.settings.update(existing.id, { value: profileData });
      } else {
        await db.settings.add({ key: 'schoolProfile', value: profileData });
      }
    } catch (e) {
      console.warn("Notice saving school profile setting:", e);
    }

    if (targetSchool.id) {
      syncTenantAcademicData(targetSchool.id).catch(e => console.warn('Academic data sync notice:', e));
    }
  };

  const loadSchoolContext = async (): Promise<School | null> => {
    try {
      const activeSchool = localStorage.getItem('esepa_active_school');
      if (activeSchool) {
        const parsed = JSON.parse(activeSchool);
        setSchool(parsed);
        return parsed;
      }

      // Fetch from Supabase schools table
      try {
        const { data } = await supabase.from('schools').select('*').limit(1).maybeSingle();
        if (data) {
          const sch: School = {
            id: data.id,
            name: data.name,
            slug: data.slug,
            theme: data.theme || 'indigo',
            logo_url: data.logo_url,
            email: data.email,
            phone: data.phone,
            address: data.address,
            academic_year: data.academic_year || '2026/2027',
            current_term: data.current_term || 'Term 1',
            status: data.status || 'active',
            created_at: data.created_at || Date.now(),
            updated_at: data.updated_at || Date.now()
          };
          await setSchoolContext(sch);
          return sch;
        }
      } catch (e) {}

      // Fallback default school
      const defaultSchool: School = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'School Sphere Academy',
        slug: 'school-sphere-academy',
        theme: 'indigo',
        created_at: Date.now(),
        updated_at: Date.now(),
        status: 'active'
      };
      await setSchoolContext(defaultSchool);
      return defaultSchool;
    } catch (err) {
      console.warn("Failed to load school context:", err);
      return null;
    }
  };

  const refreshSession = async () => {
    const savedToken = localStorage.getItem('esepa_supabase_access_token') || localStorage.getItem('esepa_auth_token');
    const savedRefreshToken = localStorage.getItem('esepa_refresh_token');
    
    if (!savedToken) return;

    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${savedToken}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setUser((prev: User | null) => ({ ...(prev || {}), ...data.user }));
          localStorage.setItem('esepa_user', JSON.stringify(data.user));
          if (data.school) {
            setSchool(data.school);
            localStorage.setItem('esepa_active_school', JSON.stringify(data.school));
          }
        }
      } else if (res.status === 401 || res.status === 403) {
        console.warn("Session token expired or revoked.");
        
        // Refresh using Supabase Auth refreshSession or /api/auth/refresh-token
        if (savedRefreshToken) {
          try {
            let newAccessToken: string | null = null;
            let newRefreshToken: string | null = null;

            const { data: sbRefreshed, error: sbRefreshErr } = await supabase.auth.refreshSession({
              refresh_token: savedRefreshToken
            });
            if (!sbRefreshErr && sbRefreshed?.session?.access_token) {
              newAccessToken = sbRefreshed.session.access_token;
              newRefreshToken = sbRefreshed.session.refresh_token || savedRefreshToken;
            } else {
              const refreshRes = await fetch('/api/auth/refresh-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: savedRefreshToken })
              });
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                if (refreshData.success && (refreshData.supabaseAccessToken || refreshData.token)) {
                  newAccessToken = refreshData.supabaseAccessToken || refreshData.token;
                  newRefreshToken = refreshData.supabaseRefreshToken || refreshData.refreshToken || savedRefreshToken;
                }
              }
            }

            if (newAccessToken) {
              setToken(newAccessToken);
              localStorage.setItem('esepa_auth_token', newAccessToken);
              localStorage.setItem('esepa_supabase_access_token', newAccessToken);
              if (newRefreshToken) {
                setRefreshToken(newRefreshToken);
                localStorage.setItem('esepa_refresh_token', newRefreshToken);
              }
              
              // Retry the original request with new Supabase token
              const retryRes = await fetch('/api/auth/me', {
                headers: {
                  'Authorization': `Bearer ${newAccessToken}`
                }
              });

              if (retryRes.ok) {
                const retryData = await retryRes.json();
                if (retryData.success && retryData.user) {
                  setUser(prev => ({ ...(prev || {}), ...retryData.user }));
                  localStorage.setItem('esepa_user', JSON.stringify(retryData.user));
                  if (retryData.school) {
                    setSchool(retryData.school);
                    localStorage.setItem('esepa_active_school', JSON.stringify(retryData.school));
                  }
                }
              }
            } else {
              logout();
            }
          } catch (refreshErr) {
            console.warn("Token refresh failed:", refreshErr);
            logout();
          }
        } else {
          logout();
        }
      }
    } catch (err) {
      console.warn("Notice refreshing session from server:", err);
    }
  };

  useEffect(() => {
    loadSchoolContext();
    // Check for existing session in localStorage
    const storedUser = localStorage.getItem('esepa_user');
    const storedToken = localStorage.getItem('esepa_auth_token');
    if (storedToken) {
      setToken(storedToken);
    }

    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser?.id) {
          db.users.get(parsedUser.id).then((dbUser: User | undefined) => {
            if (dbUser) {
              setUser(dbUser);
            } else {
              setUser(parsedUser);
            }
            setIsLoading(false);
          }).catch(() => {
            setUser(parsedUser);
            setIsLoading(false);
          });
        } else {
          setUser(parsedUser);
          setIsLoading(false);
        }
      } catch (e) {
        localStorage.removeItem('esepa_user');
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }

    // Refresh user state against server in background
    if (storedToken) {
      refreshSession();
    }

    // Listen to Supabase Auth State Changes (e.g. Magic Link OTP callback)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const email = session.user.email?.toLowerCase();
        if (!email) return;

        // If handleLogin already established a verified server session for this user, preserve the server JWT and school context
        const existingStoredUserRaw = localStorage.getItem('esepa_user');
        const existingStoredToken = localStorage.getItem('esepa_auth_token');
        if (existingStoredUserRaw && existingStoredToken) {
          try {
            const parsedExisting = JSON.parse(existingStoredUserRaw);
            if (
              parsedExisting &&
              (parsedExisting.auth_user_id === session.user.id ||
                String(parsedExisting.email || '').toLowerCase() === email ||
                parsedExisting.school_id)
            ) {
              if (!parsedExisting.auth_user_id && session.user.id) {
                const enriched = { ...parsedExisting, auth_user_id: session.user.id };
                setUser(enriched);
                localStorage.setItem('esepa_user', JSON.stringify(enriched));
              }
              if (session.access_token) {
                localStorage.setItem('esepa_supabase_access_token', session.access_token);
              }
              return;
            }
          } catch {}
        }

        try {
          // Fetch or resolve user profile in Supabase
          const { data: dbUser } = await supabase
            .from('users')
            .select('*, schools(*)')
            .or(`auth_user_id.eq.${session.user.id},email.ilike.${email}`)
            .maybeSingle();

          const resolvedSchoolId = dbUser?.school_id || session.user.user_metadata?.school_id || session.user.user_metadata?.organization_id;

          const authUserObj: User = {
            id: dbUser?.id || Date.now(),
            auth_user_id: session.user.id,
            username: dbUser?.username || session.user.user_metadata?.username || email.split('@')[0],
            fullName: dbUser?.full_name || session.user.user_metadata?.full_name || email.split('@')[0],
            email: email,
            role: dbUser?.role || session.user.user_metadata?.role || 'admin',
            status: dbUser?.status || 'active',
            schoolId: resolvedSchoolId,
            school_id: resolvedSchoolId,
            createdAt: Date.now(),
            lastLogin: Date.now()
          };

          if (session.access_token) {
            localStorage.setItem('esepa_supabase_access_token', session.access_token);
            if (!existingStoredToken) {
              setToken(session.access_token);
              localStorage.setItem('esepa_auth_token', session.access_token);
            }
          }

          setUser(authUserObj);
          localStorage.setItem('esepa_user', JSON.stringify(authUserObj));

          if (dbUser?.schools) {
            await setSchoolContext(dbUser.schools);
          } else if (resolvedSchoolId) {
            const { data: sch } = await supabase.from('schools').select('*').eq('id', resolvedSchoolId).maybeSingle();
            if (sch) {
              await setSchoolContext(sch);
            }
          }
        } catch (authErr) {
          console.warn("Notice handling Supabase onAuthStateChange session:", authErr);
        }
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Real-time Supabase Presence & Server Session Heartbeat for logged-in user
  useEffect(() => {
    if (!user) return;

    const resolvedSchoolName =
      (user as any).schoolName ||
      school?.name ||
      (user.role === 'creator' || user.role === 'super_admin' ? 'Platform Global Scope' : 'SchoolSphere Portal');

    const emitHeartbeat = () => {
      sendSessionHeartbeat({
        userId: user.id,
        authUserId: user.auth_user_id,
        username: user.username,
        fullName: user.fullName || (user as any).full_name || user.username,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId || user.school_id || school?.id || null,
        schoolName: resolvedSchoolName,
        loginAt: user.lastLogin || Date.now(),
        authStatus: 'Authenticated'
      });
    };

    emitHeartbeat();
    const hbInterval = setInterval(emitHeartbeat, 20000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        emitHeartbeat();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Join Supabase Realtime Presence channel for instant multi-client presence
    const presenceKey = String(user.auth_user_id || user.id || user.email || user.username || 'session');
    let presenceChannel: any = null;
    try {
      presenceChannel = supabase.channel('schoolsphere:live_presence', {
        config: { presence: { key: presenceKey } }
      });
      presenceChannel.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          try {
            await presenceChannel.track({
              userId: user.id,
              authUserId: user.auth_user_id,
              username: user.username,
              fullName: user.fullName || (user as any).full_name || user.username,
              email: user.email,
              role: user.role,
              schoolId: user.schoolId || user.school_id || school?.id || null,
              schoolName: resolvedSchoolName,
              loginTimestamp: user.lastLogin || Date.now(),
              lastActiveTimestamp: Date.now(),
              authStatus: 'Authenticated',
              isOnline: true
            });
          } catch {}
        }
      });
    } catch {}

    return () => {
      clearInterval(hbInterval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (presenceChannel) {
        try {
          presenceChannel.untrack();
          supabase.removeChannel(presenceChannel);
        } catch {}
      }
    };
  }, [user?.id, user?.username, user?.role, user?.school_id, school?.id, school?.name]);

  const handleLogin = async (username: string, password: string, schoolId?: string): Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }> => {
    if (!username || !password) {
      return { success: false, error: "Please enter both username and password" };
    }
    const cleanUser = username.trim().toLowerCase();

    // 1. Authoritative query against backend /api/auth/login
    // All credential hashing, validation, role scoping, license-email/key fallback, and JWT issuance is handled on the server
    let shouldAttemptSupabaseFallback = false;
    let backendErrorMsg: string | null = null;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password, schoolId })
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          const verifiedSchoolId = data.school?.id || data.user.schoolId || data.user.school_id;
          const verifiedAuthUid = data.user.auth_user_id || data.user.authUserId || data.supabaseSession?.user?.id || undefined;
          const verifiedUser: User = {
            id: data.user.id,
            auth_user_id: verifiedAuthUid,
            username: data.user.username || cleanUser,
            fullName: data.user.fullName || data.user.full_name || username,
            full_name: data.user.fullName || data.user.full_name || username,
            email: data.user.email,
            phone: data.user.phone,
            role: data.user.role || 'admin',
            status: data.user.status || 'active',
            schoolId: verifiedSchoolId,
            school_id: verifiedSchoolId,
            createdAt: data.user.createdAt || Date.now(),
            lastLogin: Date.now()
          };

          const activeSessionToken = data.supabaseSession?.access_token || data.supabaseAccessToken || data.token;
          const activeRefreshToken = data.supabaseSession?.refresh_token || data.supabaseRefreshToken || data.refreshToken;

          if (activeSessionToken) {
            setToken(activeSessionToken);
            localStorage.setItem('esepa_auth_token', activeSessionToken);
            localStorage.setItem('esepa_supabase_access_token', activeSessionToken);
          }
          if (activeRefreshToken) {
            setRefreshToken(activeRefreshToken);
            localStorage.setItem('esepa_refresh_token', activeRefreshToken);
          }

          // Update Context and local storage session before setting Supabase session so onAuthStateChange sees verified state
          setUser(verifiedUser);
          localStorage.setItem('esepa_user', JSON.stringify(verifiedUser));

          // Hydrate browser Supabase client with RLS session token when returned by backend
          if (activeSessionToken && activeRefreshToken) {
            supabase.auth.setSession({
              access_token: activeSessionToken,
              refresh_token: activeRefreshToken
            }).catch(() => {});
          }

          // Cache verified tenant user locally in Dexie scoped by school_id (never cache platform creator/super_admin in client user store)
          if (verifiedUser.role !== 'creator' && verifiedUser.role !== 'super_admin') {
            try {
              const allDbUsers = await db.users.toArray();
              const existing = allDbUsers.find(u =>
                (u.username?.trim().toLowerCase() === verifiedUser.username?.toLowerCase() || u.username?.trim().toLowerCase() === cleanUser) &&
                (!verifiedSchoolId || u.schoolId === verifiedSchoolId || u.school_id === verifiedSchoolId)
              );
              if (existing && existing.id) {
                await db.users.update(existing.id, verifiedUser);
                verifiedUser.id = existing.id;
              } else {
                const newId = await db.users.add(verifiedUser);
                verifiedUser.id = typeof data.user.id === 'number' ? data.user.id : newId as number;
              }
            } catch (e) {
              console.warn("Caching verified user locally notice:", e);
            }
          }

          if (data.school) {
            await setSchoolContext(data.school);
          } else if (verifiedSchoolId) {
            localStorage.setItem('esepa_active_school_id', String(verifiedSchoolId));
          }

          return { success: true, user: verifiedUser, token: data.token, refreshToken: data.refreshToken, school: data.school };
        } else if (data.error) {
          backendErrorMsg = data.error;
          if (res.status >= 500 || res.status === 404 || res.status === 405) {
            shouldAttemptSupabaseFallback = true;
          } else {
            return { success: false, error: data.error };
          }
        }
      } else {
        // Non-JSON response (e.g. HTTP 405 from static rewrite on edge host)
        shouldAttemptSupabaseFallback = true;
      }
    } catch (apiErr: any) {
      console.warn("Backend auth error, falling back to direct Supabase auth:", apiErr);
      shouldAttemptSupabaseFallback = true;
    }

    // 2. Direct Supabase Multi-Tenant Fallback (when /api/auth/login returns 405/404/5xx or is unreachable)
    if (shouldAttemptSupabaseFallback) {
      try {
        const strippedHandle = cleanUser.replace(/^@+/, '');
        let matchedProfile: any = null;
        let resolvedSchool: any = null;

        // Parse local handle and school slug from inputs like "admin@joyce", "@joyce", or "admin@joyce.edu.gh"
        let localHandle = strippedHandle;
        let parsedSlug = (schoolId || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (strippedHandle.includes('@')) {
          const [lhs, rhs] = strippedHandle.split('@');
          localHandle = lhs || 'admin';
          const domainSlug = (rhs || '').replace(/\.(com|org|net|edu|gh|xyz|io|app|ac|co|gov|uk|us|ca|ng|ke|za).*$/i, '').trim().toLowerCase();
          if (domainSlug && !/^(gmail|yahoo|hotmail|outlook|icloud|live|msn|aol|protonmail|zoho|mail|schoolsphere)$/i.test(domainSlug)) {
            parsedSlug = domainSlug;
          }
        } else if (
          strippedHandle &&
          !['admin', 'school_admin', 'headmaster', 'principal', 'creator', 'super_admin'].includes(strippedHandle) &&
          !parsedSlug
        ) {
          parsedSlug = strippedHandle.replace(/[^a-z0-9-]/g, '');
        }

        // Look up user profile by username or email in public.users
        try {
          const { data: userRow } = await supabase
            .from('users')
            .select('*, schools(*)')
            .or(`username.ilike.${strippedHandle},email.ilike.${strippedHandle}`)
            .limit(1)
            .maybeSingle();
          if (userRow) {
            matchedProfile = userRow;
            if (userRow.schools) {
              resolvedSchool = userRow.schools;
            }
          }
        } catch {}

        // Build candidate emails matching ensureUserSupabaseAuthIdentity conventions in server.ts
        const candidateEmails = new Set<string>();
        if (strippedHandle.includes('@') && /\.[a-z]{2,}$/i.test(strippedHandle)) {
          candidateEmails.add(normalizeEmail(strippedHandle));
        }
        if (matchedProfile?.email) {
          candidateEmails.add(String(matchedProfile.email).trim().toLowerCase());
        }
        if (strippedHandle === 'creator' || strippedHandle === 'super_admin') {
          candidateEmails.add('creator@schoolsphere.app');
        }
        const cleanBaseUser = (localHandle || 'user').replace(/[^a-z0-9_.-]/g, '') || 'user';
        if (parsedSlug) {
          candidateEmails.add(`${cleanBaseUser}@${parsedSlug}.edu.gh`);
          candidateEmails.add(`admin@${parsedSlug}.edu.gh`);
          candidateEmails.add(`${cleanBaseUser}@${parsedSlug}.com`);
        }
        candidateEmails.add(`${cleanBaseUser}@schoolsphere.edu.gh`);
        candidateEmails.add(`${cleanBaseUser}@schoolsphere.app`);
        candidateEmails.add(`${cleanBaseUser}@schoolsphere.xyz`);

        const ensureCompliantPassword = (p: string) => {
          if (!p) return '';
          let out = p;
          if (!/[a-z]/.test(out)) out += 'a';
          if (!/[A-Z]/.test(out)) out += 'A';
          if (!/[0-9]/.test(out)) out += '1';
          if (out.length < 6) out += '#2026';
          return out;
        };

        const rawTrimmedPass = password.trim();
        const candidatePasswords = Array.from(
          new Set(
            [
              rawTrimmedPass,
              ensureCompliantPassword(rawTrimmedPass),
              ensureCompliantPassword(rawTrimmedPass.toUpperCase())
            ].filter(Boolean)
          )
        );

        for (const candidateEmail of Array.from(candidateEmails)) {
          for (const candidatePassword of candidatePasswords) {
            const { data: supaAuth, error: supaErr } = await supabase.auth.signInWithPassword({
              email: candidateEmail,
              password: candidatePassword
            });

            if (!supaErr && supaAuth?.user) {
              const authUser = supaAuth.user;
              const accessToken = supaAuth.session?.access_token || '';
              const activeRefresh = supaAuth.session?.refresh_token || '';

              if (!matchedProfile) {
                try {
                  const { data: profileByUid } = await supabase
                    .from('users')
                    .select('*, schools(*)')
                    .or(`auth_user_id.eq.${authUser.id},email.ilike.${candidateEmail}`)
                    .limit(1)
                    .maybeSingle();
                  if (profileByUid) {
                    matchedProfile = profileByUid;
                    if (profileByUid.schools) resolvedSchool = profileByUid.schools;
                  }
                } catch {}
              }

              const isCreatorIdentity =
                candidateEmail === 'creator@schoolsphere.app' ||
                strippedHandle === 'creator' ||
                matchedProfile?.role === 'creator' ||
                authUser.user_metadata?.role === 'creator' ||
                authUser.app_metadata?.role === 'creator';

              const orgId = isCreatorIdentity
                ? undefined
                : matchedProfile?.school_id ||
                  matchedProfile?.organization_id ||
                  authUser.user_metadata?.school_id ||
                  authUser.user_metadata?.organization_id ||
                  authUser.app_metadata?.school_id ||
                  schoolId;

              if (!resolvedSchool && (orgId || parsedSlug)) {
                try {
                  const targetLookup = orgId || parsedSlug;
                  const { data: schoolRow } = await supabase
                    .from('schools')
                    .select('*')
                    .or(`id.eq.${targetLookup},slug.ilike.${targetLookup}`)
                    .limit(1)
                    .maybeSingle();
                  if (schoolRow) resolvedSchool = schoolRow;
                } catch {}
              }

              const resolvedRole = isCreatorIdentity
                ? 'creator'
                : matchedProfile?.role || authUser.user_metadata?.role || authUser.app_metadata?.role || 'admin';

              const verifiedUser: User = {
                id: matchedProfile?.id || authUser.id,
                auth_user_id: authUser.id,
                username: matchedProfile?.username || (isCreatorIdentity ? 'creator' : strippedHandle),
                fullName:
                  matchedProfile?.full_name ||
                  matchedProfile?.fullName ||
                  authUser.user_metadata?.full_name ||
                  (isCreatorIdentity ? 'Platform Creator' : username),
                full_name:
                  matchedProfile?.full_name ||
                  matchedProfile?.fullName ||
                  authUser.user_metadata?.full_name ||
                  (isCreatorIdentity ? 'Platform Creator' : username),
                email: matchedProfile?.email || candidateEmail,
                phone: matchedProfile?.phone || '',
                role: resolvedRole,
                status: 'active',
                schoolId: resolvedSchool?.id || orgId,
                school_id: resolvedSchool?.id || orgId,
                createdAt: Date.now(),
                lastLogin: Date.now()
              };

              if (accessToken) {
                setToken(accessToken);
                localStorage.setItem('esepa_auth_token', accessToken);
                localStorage.setItem('esepa_supabase_access_token', accessToken);
              }
              if (activeRefresh) {
                setRefreshToken(activeRefresh);
                localStorage.setItem('esepa_refresh_token', activeRefresh);
              }

              setUser(verifiedUser);
              localStorage.setItem('esepa_user', JSON.stringify(verifiedUser));

              if (resolvedSchool) {
                await setSchoolContext(resolvedSchool);
              } else if (verifiedUser.schoolId) {
                localStorage.setItem('esepa_active_school_id', String(verifiedUser.schoolId));
              }

              return {
                success: true,
                user: verifiedUser,
                token: accessToken || undefined,
                refreshToken: activeRefresh || undefined,
                school: resolvedSchool || undefined
              };
            }
          }
        }
      } catch (supaFallbackErr) {
        console.warn("Direct Supabase fallback error:", supaFallbackErr);
      }
    }

    return { success: false, error: backendErrorMsg || "Invalid username or password" };
  };

  const signInWithPassword = async (email: string, passwordCandidate: string): Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }> => {
    if (!email || !passwordCandidate) {
      return { success: false, error: "Please enter both email and password" };
    }
    const cleanEmail = email.trim().toLowerCase().includes('@') ? normalizeEmail(email) : email.trim().toLowerCase();

    // 1. Authoritative backend multi-tenant sign-in first (issues server JWT + Supabase RLS session + records login in public.audit_logs & public.users.last_login)
    const result = await handleLogin(cleanEmail, passwordCandidate);
    if (result.success && result.user) {
      return { success: true, user: result.user, token: result.token, refreshToken: result.refreshToken, school: result.school };
    }

    // 2. Fallback to Supabase Auth direct client if backend didn't match
    if (cleanEmail.includes('@')) {
      try {
        const { data: supaAuth, error: supaErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: passwordCandidate
        });

        if (!supaErr && supaAuth?.user) {
          const authUser = supaAuth.user;
          const accessToken = supaAuth.session?.access_token || null;
          if (accessToken) {
            setToken(accessToken);
            localStorage.setItem('esepa_auth_token', accessToken);
          }

          let orgId = authUser.user_metadata?.school_id || authUser.user_metadata?.organization_id || authUser.app_metadata?.organization_id;
          let role = authUser.user_metadata?.role || 'admin';
          let fullName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0];
          let profile: any = null;

          try {
            const res = await supabase
              .from('users')
              .select('*, schools(*)')
              .or(`auth_user_id.eq.${authUser.id},email.ilike.${cleanEmail}`)
              .maybeSingle();
            profile = res.data;

            if (profile) {
              orgId = profile.school_id || profile.organization_id || orgId;
              role = profile.role || role;
              fullName = profile.full_name || fullName;
              if (profile.schools) {
                await setSchoolContext(profile.schools);
              }
            }
          } catch (e) {}

          const userObj: User = {
            id: (profile?.id as number) || Date.now(),
            auth_user_id: authUser.id,
            username: profile?.username || cleanEmail.split('@')[0],
            fullName: fullName,
            email: cleanEmail,
            role: role,
            status: 'active',
            schoolId: orgId,
            school_id: orgId,
            createdAt: Date.now(),
            lastLogin: Date.now()
          };

          setUser(userObj);
          localStorage.setItem('esepa_user', JSON.stringify(userObj));

          recordUserLogin({
            auth_user_id: authUser.id,
            organization_id: orgId,
            email: cleanEmail,
            status: 'success_supabase_auth'
          });

          return { success: true, user: userObj, token: accessToken || undefined };
        }
      } catch (e) {
        console.warn("Supabase direct auth attempt notice:", e);
      }
    }

    const friendlyError = mapAuthErrorMessage(result.error);
    return { success: false, error: friendlyError };
  };

  const registerOrganization = async (data: RegisterOrgPayload): Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }> => {
    try {
      const res = await fetch('/api/auth/register-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: mapAuthErrorMessage(json.error) };
      }

      // Ensure every new client/tenant starts on a 100% clean slate with zero residual data
      await clearTenantLocalDatabase(json.organization?.id);
      if (json.organization?.id) {
        localStorage.setItem('esepa_active_school_id', json.organization.id);
      }

      if (json.token) {
        setToken(json.token);
        localStorage.setItem('esepa_auth_token', json.token);
      }
      if (json.refreshToken) {
        setRefreshToken(json.refreshToken);
        localStorage.setItem('esepa_refresh_token', json.refreshToken);
      }
      if (json.user) {
        setUser(json.user);
        localStorage.setItem('esepa_user', JSON.stringify(json.user));
        if (json.user.role !== 'creator' && json.user.role !== 'super_admin') {
          try {
            await db.users.add({
              ...json.user,
              fullName: json.user.fullName || json.user.full_name || json.user.username,
              schoolId: json.organization?.id || json.user.school_id,
              school_id: json.organization?.id || json.user.school_id,
              status: 'active',
              createdAt: Date.now()
            });
          } catch (e) {}
        }
      }
      if (json.organization) {
        await setSchoolContext(json.organization);
      }

      return {
        success: true,
        user: json.user,
        token: json.token,
        refreshToken: json.refreshToken,
        school: json.organization
      };
    } catch (err: any) {
      return { success: false, error: mapAuthErrorMessage(err.message) };
    }
  };

  const joinWithInviteToken = async (data: JoinInvitePayload): Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }> => {
    try {
      const res = await fetch('/api/auth/join-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: mapAuthErrorMessage(json.error) };
      }

      await clearTenantLocalDatabase(json.organization?.id);
      if (json.organization?.id) {
        localStorage.setItem('esepa_active_school_id', json.organization.id);
      }

      if (json.token) {
        setToken(json.token);
        localStorage.setItem('esepa_auth_token', json.token);
      }
      if (json.refreshToken) {
        setRefreshToken(json.refreshToken);
        localStorage.setItem('esepa_refresh_token', json.refreshToken);
      }
      if (json.user) {
        setUser(json.user);
        localStorage.setItem('esepa_user', JSON.stringify(json.user));
      }
      if (json.organization) {
        await setSchoolContext(json.organization);
      }

      return {
        success: true,
        user: json.user,
        token: json.token,
        refreshToken: json.refreshToken,
        school: json.organization
      };
    } catch (err: any) {
      return { success: false, error: mapAuthErrorMessage(err.message) };
    }
  };

  const login = async (username: string, password: string, schoolId?: string): Promise<boolean> => {
    const result = await handleLogin(username, password, schoolId);
    return result.success;
  };

  const logout = () => {
    if (user) {
      sendSessionLogout({
        userId: user.id,
        authUserId: user.auth_user_id,
        username: user.username,
        email: user.email,
        schoolId: user.schoolId || user.school_id || school?.id || null
      });
    }
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem('esepa_user');
    localStorage.removeItem('esepa_auth_token');
    localStorage.removeItem('esepa_refresh_token');
    localStorage.removeItem('esepa_supabase_access_token');
    localStorage.removeItem('esepa_active_school_id');
    supabase.auth.signOut().catch(() => {});
    clearTenantLocalDatabase().catch(() => {});
  };

  const register = async (
    username: string,
    password: string,
    fullName: string,
    role: User['role'],
    email?: string,
    phone?: string
  ): Promise<boolean> => {
    const cleanUser = username.trim().toLowerCase();
    const activeSchoolId = school?.id || '00000000-0000-0000-0000-000000000001';

    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          password,
          fullName: fullName.trim() || cleanUser,
          role,
          email: email || `${cleanUser}@schoolsphere.xyz`,
          phone: phone || '',
          schoolId: activeSchoolId,
          status: 'active'
        })
      });

      if (resp.ok) {
        const respData = await resp.json();
        const activeUser: User = {
          id: respData.user?.id || Date.now(),
          username: cleanUser,
          fullName: fullName.trim() || cleanUser,
          full_name: fullName.trim() || cleanUser,
          email: email || `${cleanUser}@schoolsphere.xyz`,
          phone: phone || '',
          role,
          status: 'active',
          schoolId: role === 'super_admin' ? undefined : activeSchoolId,
          school_id: role === 'super_admin' ? undefined : activeSchoolId,
          createdAt: Date.now(),
          lastLogin: Date.now()
        };

        const sessionToken = respData.supabaseAccessToken || respData.token;
        if (sessionToken) {
          setToken(sessionToken);
          localStorage.setItem('esepa_auth_token', sessionToken);
          localStorage.setItem('esepa_supabase_access_token', sessionToken);
        }

        setUser(activeUser);
        localStorage.setItem('esepa_user', JSON.stringify(activeUser));
        return true;
      }
      return false;
    } catch (apiErr) {
      console.warn("Notice calling /api/auth/register:", apiErr);
      return false;
    }
  };

  const switchRole = (role: User['role']) => {
    if (user) {
      const updatedUser = { ...user, role };
      setUser(updatedUser);
      localStorage.setItem('esepa_user', JSON.stringify(updatedUser));
    }
  };

  const hasPermission = useCallback((permission: AppPermission): boolean => {
    return checkPermission(user?.role, permission);
  }, [user?.role]);

  const canAccessModule = useCallback((moduleId: string, activeLicenseModules?: string[]): boolean => {
    return checkModuleAccess(user?.role, moduleId, activeLicenseModules);
  }, [user?.role]);

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const activeToken = token || localStorage.getItem('esepa_auth_token');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to update password' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network communication error' };
    }
  };

  const signInWithMagicLink = async (email: string): Promise<{ success: boolean; error?: string; magicLinkUrl?: string; emailOtpCode?: string }> => {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please provide a valid email address.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const redirectUrl = "https://ai.studio/apps/a3dcbc82-0bbd-43c0-9bc8-6b9090159f51";

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, redirectUrl })
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.success) {
          return { success: true, magicLinkUrl: data.magicLinkUrl, emailOtpCode: data.emailOtpCode };
        }
        if (data.error) {
          return { success: false, error: data.error };
        }
      }
    } catch (apiErr) {
      console.warn("Backend magic link notice, falling back to direct Supabase client:", apiErr);
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: false,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to dispatch magic link.' };
    }
  };

  const verifyOtp = async (email: string, token: string): Promise<{ success: boolean; error?: string }> => {
    if (!email || !token) {
      return { success: false, error: 'Email and OTP token are required.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'magiclink'
      });

      if (error) {
        // Retry with email type
        const { data: retryData, error: retryErr } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: 'email'
        });
        if (retryErr) {
          return { success: false, error: retryErr.message };
        }
        if (retryData?.session) {
          setToken(retryData.session.access_token);
          localStorage.setItem('esepa_auth_token', retryData.session.access_token);
          return { success: true };
        }
      }

      if (data?.session) {
        setToken(data.session.access_token);
        localStorage.setItem('esepa_auth_token', data.session.access_token);
        return { success: true };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Verification failed.' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      school,
      token,
      refreshToken,
      isLoading,
      login,
      handleLogin,
      signInWithPassword,
      registerOrganization,
      joinWithInviteToken,
      logout,
      register,
      switchRole,
      loadSchoolContext,
      setSchoolContext,
      hasPermission,
      canAccessModule,
      changePassword,
      refreshSession,
      signInWithMagicLink,
      verifyOtp
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
