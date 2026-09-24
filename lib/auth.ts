/**
 * Server-Side Authentication & Authorization Helpers
 * JWT token generation, verification, and RBAC middleware.
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

dotenv.config();

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'test') {
      return 'test-suite-secure-jwt-secret-key-for-unit-tests';
    }
    return 'schoolsphere-dev-fallback-jwt-secret-key-3.1';
  }
  return secret;
}

const TOKEN_EXPIRY = '7d';

export interface AuthJwtPayload {
  id: number | string;
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
 * Generate a signed JWT for a validated user session.
 */
export function generateAuthToken(payload: Omit<AuthJwtPayload, 'iat' | 'exp'>): string {
  const targetOrgId = payload.organization_id || payload.school_id || payload.schoolId || null;
  return jwt.sign(
    {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      role: payload.role || 'teacher',
      school_id: targetOrgId,
      schoolId: targetOrgId,
      organization_id: targetOrgId,
      fullName: payload.fullName || payload.username
    },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Verify and decode an authentication token.
 */
export function verifyAuthToken(token: string): AuthJwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthJwtPayload;
  } catch (err) {
    return null;
  }
}

/**
 * Express Middleware: Authenticates the request via Bearer JWT token in headers.
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (!token) {
    // Check if optional query token exists
    const queryToken = req.query.token as string;
    if (queryToken) {
      const decoded = verifyAuthToken(queryToken);
      if (decoded) {
        req.user = decoded;
        return next();
      }
    }
    return res.status(401).json({ success: false, error: 'Authentication required. Please provide a valid authorization token.' });
  }

  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(403).json({ success: false, error: 'Invalid or expired session token. Please log in again.' });
  }

  req.user = decoded;
  next();
}

/**
 * Optional Authentication Middleware: Attaches req.user if a valid token is present, but allows anonymous if not.
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
      error: `Access forbidden. This action requires one of the following roles: [${allowedRoles.join(', ')}]. Your current role is: ${userRole}.`
    });
  };
}

/**
 * Express Middleware: Enforces tenant/school isolation.
 * Guarantees a user cannot query or mutate data belonging to another school unless they are a superadmin.
 * Deny-by-default: automatically scopes to requesting user's own school if unspecified.
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
      error: 'Tenant isolation violation: User is not assigned to any organization or school.'
    });
  }

  const headerSchoolId = req.headers['x-school-id'] as string || req.headers['x-organization-id'] as string;
  const targetSchoolId = req.params.organizationId || req.params.schoolId || req.body?.organization_id || req.body?.school_id || req.body?.schoolId || req.query.organization_id || req.query.school_id || req.query.schoolId || headerSchoolId;

  if (targetSchoolId && targetSchoolId !== userOrgId) {
    return res.status(403).json({
      success: false,
      error: 'Tenant isolation violation: You do not have permission to access resources belonging to a different school.'
    });
  }

  // Auto-scope request to user's school if not specified
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
