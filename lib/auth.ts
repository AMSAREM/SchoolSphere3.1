/**
 * Server-Side Authentication & Authorization Helpers
 * Strictly verifies Supabase Auth sessions via adminClient.auth.getUser(accessToken)
 * (and cryptographic SUPABASE_JWT_SECRET verification when configured) and enforces RBAC + Tenant Isolation.
 * Custom HMAC JWT generation and fallback secrets have been completely removed.
 */

import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { getSupabaseAdmin, getSupabaseUrlStrict } from './supabase/server';

dotenv.config();

function cleanEnvVal(val: string | undefined): string {
  if (!val) return '';
  let trimmed = val.trim();
  const match = trimmed.match(/^[A-Z0-9_]+=(.+)$/);
  if (match) {
    trimmed = match[1].trim();
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export interface AuthJwtPayload {
  id: number | string;
  sub?: string | null;
  auth_user_id?: string | null;
  authUserId?: string | null;
  username: string;
  email?: string;
  role: string;
  school_id?: string | null;
  schoolId?: string | null;
  organization_id?: string | null;
  fullName?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthJwtPayload;
}

const verifiedTokenCache = new Map<string, { payload: AuthJwtPayload; expiresAt: number }>();
const VERIFIED_TOKEN_CACHE_TTL_MS = 30_000;

function buildPayloadFromClaims(claims: {
  sub: string;
  email?: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
  iat?: number;
  exp?: number;
}): AuthJwtPayload {
  const meta = claims.user_metadata || {};
  const appMeta = claims.app_metadata || {};
  const schoolId =
    meta.school_id ||
    meta.organization_id ||
    appMeta.school_id ||
    appMeta.organization_id ||
    null;
  const email = String(claims.email || meta.email || '').trim().toLowerCase();
  const isCreatorIdentity =
    email === 'creator@schoolsphere.app' ||
    meta.role === 'creator' ||
    meta.role === 'super_admin' ||
    appMeta.role === 'creator' ||
    appMeta.role === 'super_admin';
  const role = isCreatorIdentity
    ? (meta.role || appMeta.role || 'creator')
    : (meta.role || appMeta.role || 'admin');
  const username =
    meta.username ||
    meta.scoped_username ||
    (email ? email.split('@')[0] : String(claims.sub));

  return {
    id: meta.user_id || claims.sub,
    sub: claims.sub,
    auth_user_id: claims.sub,
    authUserId: claims.sub,
    username,
    email,
    role,
    school_id: isCreatorIdentity ? null : schoolId,
    schoolId: isCreatorIdentity ? null : schoolId,
    organization_id: isCreatorIdentity ? null : schoolId,
    fullName: meta.full_name || username,
    iat: claims.iat,
    exp: claims.exp,
  };
}

/**
 * Synchronous token verifier using cached `adminClient.auth.getUser()` sessions
 * or cryptographic `SUPABASE_JWT_SECRET` verification.
 * Never falls back to unverified `jwt.decode()`.
 */
export function verifyAuthToken(token: string): AuthJwtPayload | null {
  if (!token || typeof token !== 'string') return null;

  const nowMs = Date.now();
  const cached = verifiedTokenCache.get(token);
  if (cached && cached.expiresAt > nowMs) {
    return cached.payload;
  }

  try {
    const supabaseUrl = getSupabaseUrlStrict().replace(/\/+$/, '');
    const expectedIssuer = `${supabaseUrl}/auth/v1`;
    const supabaseJwtSecret =
      cleanEnvVal(process.env.SUPABASE_JWT_SECRET) ||
      (process.env.NODE_ENV === 'test' ? cleanEnvVal(process.env.JWT_SECRET) : '');

    if (!supabaseJwtSecret) {
      return null;
    }

    const decoded = jwt.verify(token, supabaseJwtSecret, {
      issuer: expectedIssuer,
    }) as any;

    if (
      !decoded ||
      typeof decoded !== 'object' ||
      !decoded.sub ||
      decoded.aud !== 'authenticated' ||
      decoded.role !== 'authenticated' ||
      typeof decoded.iss !== 'string' ||
      decoded.iss !== expectedIssuer
    ) {
      return null;
    }

    const nowSec = Math.floor(nowMs / 1000);
    if (typeof decoded.exp === 'number' && decoded.exp < nowSec) {
      return null;
    }

    const payload = buildPayloadFromClaims(decoded);
    const expMs = typeof decoded.exp === 'number' ? decoded.exp * 1000 : nowMs + VERIFIED_TOKEN_CACHE_TTL_MS;
    verifiedTokenCache.set(token, {
      payload,
      expiresAt: Math.min(expMs, nowMs + VERIFIED_TOKEN_CACHE_TTL_MS),
    });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Asynchronous Supabase Auth session verifier via `adminClient.auth.getUser(accessToken)`.
 * Uses cryptographic `verifyAuthToken` first when `SUPABASE_JWT_SECRET` is configured,
 * and otherwise verifies directly against Supabase Auth (`auth.users`).
 */
export async function verifySupabaseSessionToken(token: string): Promise<AuthJwtPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const syncVerified = verifyAuthToken(token);
  if (syncVerified) {
    return syncVerified;
  }

  try {
    const adminClient = getSupabaseAdmin();
    if (typeof adminClient?.auth?.getUser !== 'function') {
      return null;
    }

    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data?.user?.id) {
      return null;
    }

    const authUser = data.user;
    const payload = buildPayloadFromClaims({
      sub: authUser.id,
      email: authUser.email,
      user_metadata: authUser.user_metadata,
      app_metadata: authUser.app_metadata,
    });

    verifiedTokenCache.set(token, {
      payload,
      expiresAt: Date.now() + VERIFIED_TOKEN_CACHE_TTL_MS,
    });

    return payload;
  } catch {
    return null;
  }
}

/**
 * Express Middleware: Authenticates the request via Supabase Auth Bearer token (`adminClient.auth.getUser(accessToken)`).
 */
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    if (!token) {
      const queryToken = req.query.token as string;
      if (queryToken) {
        const decoded = await verifySupabaseSessionToken(queryToken);
        if (decoded) {
          req.user = decoded;
          return next();
        }
      }
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Supabase Auth session token.',
      });
    }

    const decoded = await verifySupabaseSessionToken(token);
    if (!decoded) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired Supabase session token. Please log in again.',
      });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired Supabase session token. Please log in again.',
    });
  }
}

/**
 * Optional Authentication Middleware: Attaches req.user if a valid Supabase Auth session token is present.
 */
export async function optionalAuthenticateToken(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    if (token) {
      const decoded = await verifySupabaseSessionToken(token);
      if (decoded) {
        req.user = decoded;
      }
    }
  } catch {}
  next();
}

/**
 * Express Middleware: Restricts access to specified user roles.
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const userRole = (req.user.role || '').toLowerCase();
    const isSuper = userRole === 'super_admin' || userRole === 'creator';

    if (isSuper || allowedRoles.map(r => r.toLowerCase()).includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Access forbidden. This action requires one of the following roles: [${allowedRoles.join(', ')}]. Your current role is: ${userRole}.`,
    });
  };
}

/**
 * Express Middleware: Enforces tenant/school isolation.
 */
export function requireSchoolScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  const userRole = (req.user.role || '').toLowerCase();
  const isSuper = userRole === 'super_admin' || userRole === 'creator';

  if (isSuper) {
    return next();
  }

  const userOrgId = req.user.organization_id || req.user.school_id;
  if (!userOrgId) {
    return res.status(403).json({
      success: false,
      error: 'Tenant isolation violation: User is not assigned to any organization or school.',
    });
  }

  const headerSchoolId = (req.headers['x-school-id'] as string) || (req.headers['x-organization-id'] as string);
  const targetSchoolId =
    req.params.organizationId ||
    req.params.schoolId ||
    req.body?.organization_id ||
    req.body?.school_id ||
    req.body?.schoolId ||
    req.query.organization_id ||
    req.query.school_id ||
    req.query.schoolId ||
    headerSchoolId;

  if (targetSchoolId && targetSchoolId !== userOrgId) {
    return res.status(403).json({
      success: false,
      error: 'Tenant isolation violation: You do not have permission to access resources belonging to a different school.',
    });
  }

  if (!targetSchoolId) {
    if (req.body && typeof req.body === 'object') {
      req.body.school_id = userOrgId;
      req.body.organization_id = userOrgId;
    }
    if (req.query) {
      req.query.school_id = userOrgId;
      req.query.organization_id = userOrgId;
    }
    req.headers['x-school-id'] = userOrgId;
    req.headers['x-organization-id'] = userOrgId;
  }

  next();
}
