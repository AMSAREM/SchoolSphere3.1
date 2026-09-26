import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { db, User, School, clearTenantLocalDatabase, purgeDemoRecordsFromDb } from '../db/schema';
import { supabase } from '../lib/supabase/client';
import { syncTenantAcademicData } from '../lib/api';
import { AppPermission, UserRole, hasPermission as checkPermission, canAccessModule as checkModuleAccess, getRoleInfo } from '../lib/permissions';
import { recordUserLogin, mapAuthErrorMessage } from '../lib/authTelemetry';
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
    const savedToken = localStorage.getItem('esepa_auth_token');
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
        
        // Try to refresh using refresh token
        if (savedRefreshToken) {
          try {
            const refreshRes = await fetch('/api/auth/refresh-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: savedRefreshToken })
            });

            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              if (refreshData.success && refreshData.token) {
                setToken(refreshData.token);
                localStorage.setItem('esepa_auth_token', refreshData.token);
                
                // Retry the original request with new token
                const retryRes = await fetch('/api/auth/me', {
                  headers: {
                    'Authorization': `Bearer ${refreshData.token}`
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
              }
            } else {
              // Refresh token also expired, clear session
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

        try {
          // Fetch or resolve user profile in Supabase
          const { data: dbUser } = await supabase
            .from('users')
            .select('*, schools(*)')
            .or(`auth_user_id.eq.${session.user.id},email.ilike.${email}`)
            .maybeSingle();

          const authUserObj: User = {
            id: dbUser?.id || Date.now(),
            username: dbUser?.username || email.split('@')[0],
            fullName: dbUser?.full_name || session.user.user_metadata?.full_name || email.split('@')[0],
            email: email,
            role: dbUser?.role || 'admin',
            status: dbUser?.status || 'active',
            schoolId: dbUser?.school_id,
            school_id: dbUser?.school_id,
            createdAt: Date.now(),
            lastLogin: Date.now()
          };

          if (session.access_token) {
            setToken(session.access_token);
            localStorage.setItem('esepa_auth_token', session.access_token);
          }

          setUser(authUserObj);
          localStorage.setItem('esepa_user', JSON.stringify(authUserObj));

          if (dbUser?.schools) {
            await setSchoolContext(dbUser.schools);
          } else if (dbUser?.school_id) {
            const { data: sch } = await supabase.from('schools').select('*').eq('id', dbUser.school_id).maybeSingle();
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

  const handleLogin = async (username: string, password: string, schoolId?: string): Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }> => {
    if (!username || !password) {
      return { success: false, error: "Please enter both username and password" };
    }
    const cleanUser = username.trim().toLowerCase();

    // 1. Authoritative query against backend /api/auth/login
    // All credential hashing, validation, role scoping, license-email/key fallback, and JWT issuance is handled on the server
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
          const verifiedUser: User = {
            id: data.user.id,
            username: data.user.username || cleanUser,
            passwordHash: '',
            password_hash: '',
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

          if (data.token) {
            setToken(data.token);
            localStorage.setItem('esepa_auth_token', data.token);
          }
          if (data.refreshToken) {
            setRefreshToken(data.refreshToken);
            localStorage.setItem('esepa_refresh_token', data.refreshToken);
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

          // Update Context and local storage session
          setUser(verifiedUser);
          localStorage.setItem('esepa_user', JSON.stringify(verifiedUser));
          return { success: true, user: verifiedUser, token: data.token, refreshToken: data.refreshToken, school: data.school };
        } else if (data.error) {
          return { success: false, error: data.error };
        }
      }
      return { success: false, error: "Invalid username or password" };
    } catch (apiErr: any) {
      console.warn("Backend auth error:", apiErr);
      return { success: false, error: "Unable to reach the authentication service. Please check your network connection." };
    }
  };

  const signInWithPassword = async (email: string, passwordCandidate: string): Promise<{ success: boolean; error?: string; user?: User; token?: string; refreshToken?: string; school?: School }> => {
    if (!email || !passwordCandidate) {
      return { success: false, error: "Please enter both email and password" };
    }
    const cleanEmail = email.trim().toLowerCase().includes('@') ? normalizeEmail(email) : email.trim().toLowerCase();

    // 1. Authoritative backend multi-tenant sign-in first (issues server JWT + resolves school & license credentials)
    const result = await handleLogin(cleanEmail, passwordCandidate);
    if (result.success && result.user) {
      // Optionally synchronize Supabase client session in the background if email/password exists in Supabase Auth
      if (cleanEmail.includes('@')) {
        supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: passwordCandidate
        }).catch(() => {});
      }
      recordUserLogin({
        auth_user_id: String(result.user.id),
        organization_id: result.user.school_id,
        email: result.user.email || cleanEmail,
        status: 'success_api_login'
      });
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
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem('esepa_user');
    localStorage.removeItem('esepa_auth_token');
    localStorage.removeItem('esepa_refresh_token');
    localStorage.removeItem('esepa_active_school_id');
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
          passwordHash: '',
          password_hash: '',
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

        if (respData.token) {
          setToken(respData.token);
          localStorage.setItem('esepa_auth_token', respData.token);
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
