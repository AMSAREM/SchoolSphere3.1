import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { 
  generateAuthToken, 
  verifyAuthToken, 
  requireRoles, 
  requireSchoolScope, 
  AuthenticatedRequest 
} from '../lib/auth';
import { app, startServer } from '../server';

describe('Security & API Endpoints Test Suite', () => {
  let adminTokenSchoolA: string;
  let teacherElenaTokenSchoolA: string;
  let adminTokenSchoolB: string;
  let superAdminToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await startServer();

    // 1. School A Admin
    adminTokenSchoolA = generateAuthToken({
      id: 'user-admin-a',
      username: 'school_a_admin',
      role: 'admin',
      school_id: 'school-uuid-a',
      fullName: 'School A Admin'
    });

    // 2. Elena with teacher role at School A (Backdoor removal verification)
    teacherElenaTokenSchoolA = generateAuthToken({
      id: 'user-elena-teacher',
      username: 'elena',
      role: 'teacher',
      school_id: 'school-uuid-a',
      fullName: 'Elena Mensah'
    });

    // 3. School B Admin
    adminTokenSchoolB = generateAuthToken({
      id: 'user-admin-b',
      username: 'school_b_admin',
      role: 'admin',
      school_id: 'school-uuid-b',
      fullName: 'School B Admin'
    });

    // 4. Super Admin / Creator
    superAdminToken = generateAuthToken({
      id: 'user-super-creator',
      username: 'vendor_creator',
      role: 'creator',
      fullName: 'System Creator'
    });
  });

  describe('Requirement 1 & 2: Token Verification and Backdoor Elimination', () => {
    it('generates and verifies valid tokens properly', () => {
      const decoded = verifyAuthToken(adminTokenSchoolA);
      expect(decoded).not.toBeNull();
      expect(decoded?.username).toBe('school_a_admin');
      expect(decoded?.role).toBe('admin');
      expect(decoded?.school_id).toBe('school-uuid-a');
    });

    it('rejects invalid or tampered tokens', () => {
      const invalidToken = adminTokenSchoolA + 'tampered';
      const decoded = verifyAuthToken(invalidToken);
      expect(decoded).toBeNull();
    });

    it('CONFIRMS BACKDOOR REMOVED: Username "elena" with role="teacher" is DENIED admin access', () => {
      const mockReq: Partial<AuthenticatedRequest> = {
        user: {
          id: 'user-elena',
          username: 'elena',
          role: 'teacher',
          school_id: 'school-uuid-a'
        }
      };

      let statusCode = 200;
      let responseBody: any = null;
      let nextCalled = false;

      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => { responseBody = body; }
          };
        }
      };

      const adminGuard = requireRoles('admin');
      adminGuard(mockReq as AuthenticatedRequest, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(403);
      expect(responseBody.error).toContain('Access forbidden');
    });

    it('CONFIRMS BACKDOOR REMOVED: Username "elena_master" with role="teacher" is DENIED admin access', () => {
      const mockReq: Partial<AuthenticatedRequest> = {
        user: {
          id: 'user-elena-2',
          username: 'elena_master',
          role: 'teacher',
          school_id: 'school-uuid-a'
        }
      };

      let statusCode = 200;
      let nextCalled = false;
      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return { json: () => {} };
        }
      };

      const adminGuard = requireRoles('admin');
      adminGuard(mockReq as AuthenticatedRequest, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(403);
    });

    it('allows genuine super_admin or creator roles regardless of username', () => {
      const mockReq: Partial<AuthenticatedRequest> = {
        user: {
          id: 'user-creator',
          username: 'custom_username',
          role: 'creator'
        }
      };

      let nextCalled = false;
      const mockRes: any = {
        status: () => ({ json: () => {} })
      };

      const adminGuard = requireRoles('admin');
      adminGuard(mockReq as AuthenticatedRequest, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });
  });

  describe('Requirement 3: Multi-Tenant Isolation & RLS Enforcement', () => {
    it('DENIES access when User from School A tries to access School B resources', () => {
      const mockReq: Partial<AuthenticatedRequest> = {
        user: {
          id: 'user-a',
          username: 'school_a_user',
          role: 'admin',
          school_id: 'school-uuid-a'
        },
        params: { schoolId: 'school-uuid-b' },
        headers: {}
      };

      let statusCode = 200;
      let responseBody: any = null;
      let nextCalled = false;

      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => { responseBody = body; }
          };
        }
      };

      requireSchoolScope(mockReq as AuthenticatedRequest, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(403);
      expect(responseBody.error).toContain('Tenant isolation violation');
    });

    it('AUTO-SCOPES request to user school if no school_id was specified', () => {
      const mockReq: Partial<AuthenticatedRequest> = {
        user: {
          id: 'user-a',
          username: 'school_a_user',
          role: 'admin',
          school_id: 'school-uuid-a'
        },
        params: {},
        body: {},
        query: {},
        headers: {}
      };

      let nextCalled = false;
      const mockRes: any = {
        status: () => ({ json: () => {} })
      };

      requireSchoolScope(mockReq as AuthenticatedRequest, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(mockReq.body.school_id).toBe('school-uuid-a');
      expect(mockReq.headers!['x-school-id']).toBe('school-uuid-a');
    });
  });

  describe('Requirement 4: API Route Authentication & Gating', () => {
    it('GET /api/health responds with health status', async () => {
      const res = await request(app).get('/api/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('database');
    });

    it('GET /api/license/status REJECTS unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/license/status');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/license/status ACCEPTS valid authenticated request', async () => {
      const res = await request(app)
        .get('/api/license/status')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('active');
      expect(res.body).toHaveProperty('activeModules');
      expect(Array.isArray(res.body.activeModules)).toBe(true);
    });

    it('POST /api/auth/login rejects empty requests with 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('required');
    });

    it('POST /api/license/activate rejects missing key with 400', async () => {
      const res = await request(app)
        .post('/api/license/activate')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('required');
    });
  });
});
