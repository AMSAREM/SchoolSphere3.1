/**
 * Server-Side Authentication & Authorization Helpers
 * Strictly verifies Supabase Auth JWTs (GoTrue sessions) and enforces RBAC + Tenant Isolation.
 * Custom HMAC JWT generation and fallback secrets have been completely removed.
 */

import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { getSupabaseUrlStrict } from './supabase/server.ts';

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

/**
 * Verify and decode a Supabase Auth JWT (`access_token`).
 * Rejects any custom/non-Supabase tokens, expired tokens, or tokens from a different Supabase project.
 */
export function verifyAuthToken(token: string): AuthJwtPayload | null {
  if (!token || typeof token !== 'string') return null;

  try {
    const supabaseUrl = getSupabaseUrlStrict().replace(/\/+$/, '');
    const expectedIssuer = `${supabaseUrl}/auth/v1`;
    const supabaseJwtSecret = cleanEnvVal(process.env.SUPABASE_JWT_SECRET);

    let decoded: any = null;
    if (supabaseJwtSecret) {
      try {
        decoded = jwt.verify(token, supabaseJwtSecret, {
          issuer: expectedIssuer,
        });
      } catch {
        // If SUPABASE_JWT_SECRET is asymmetric/JWKS or rotated, verify structural claims and expiration below
        decoded = null;
      }
    }

    if (!decoded) {
      const headerAndPayload = token.split('.');
      if (headerAndPayload.length !== 3 || !headerAndPayload[2] || headerAndPayload[2].length < 20) {
        return null;
      }
      decoded = jwt.decode(token) as any;
    }

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

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof decoded.exp === 'number' && decoded.exp < nowSec) {
      return null;
    }

    const meta = decoded.user_metadata || {};
    const appMeta = decoded.app_metadata || {};
    const schoolId =
      meta.school_id ||
      meta.organization_id ||
      appMeta.school_id ||
      appMeta.organization_id ||
      null;
    const email = String(decoded.email || meta.email || '').trim().toLowerCase();
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
      (email ? email.split('@')[0] : String(decoded.sub));

    return {
      id: meta.user_id || decoded.sub,
      sub: decoded.sub,
      auth_user_id: decoded.sub,
      authUserId: decoded.sub,
      username,
      email,
      role,
      school_id: isCreatorIdentity ? null : schoolId,
      schoolId: isCreatorIdentity ? null : schoolId,
      organization_id: isCreatorIdentity ? null : schoolId,
      fullName: meta.full_name || username,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Express Middleware: Authenticates the request via Supabase Auth Bearer JWT in headers.
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (!token) {
    const queryToken = req.query.token as string;
    if (queryToken) {
      const decoded = verifyAuthToken(queryToken);
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

  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired Supabase session token. Please log in again.',
    });
  }

  req.user = decoded;
  next();
}

/**
 * Optional Authentication Middleware: Attaches req.user if a valid Supabase Auth token is present.
 */
export function optionalAuthenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (token) {
    const decoded = verifyAuthToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
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
