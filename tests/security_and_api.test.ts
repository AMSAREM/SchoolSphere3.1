import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// In-Memory Supabase mock database for hermetic test execution
export const testSupabaseDB: Record<string, any[]> = {
  schools: [
    { id: 'school-uuid-a', name: 'School A Academy', slug: 'school-a', status: 'active' },
    { id: 'school-uuid-b', name: 'School B College', slug: 'school-b', status: 'active' }
  ],
  school_licenses: [
    {
      id: 'lic-a',
      school_id: 'school-uuid-a',
      license_key: 'TEST-LICENSE-KEY-A',
      active_status: 'active',
      active_modules: JSON.stringify(['dashboard', 'students', 'academic', 'timetable', 'attendance', 'results', 'fees']),
      created_at: Date.now(),
      expiry_date: Date.now() + 86400000 * 365
    }
  ],
  students: [],
  classes: [],
  subjects: [],
  teachers: [],
  attendance: [],
  results: [],
  users: []
};

class MockQueryBuilder {
  private tableName: string;
  private filters: Array<(row: any) => boolean> = [];
  private pendingOperation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private operationData: any = null;

  constructor(table: string) {
    this.tableName = table;
    if (!testSupabaseDB[this.tableName]) {
      testSupabaseDB[this.tableName] = [];
    }
  }

  select(_cols = '*') {
    if (this.pendingOperation !== 'insert' && this.pendingOperation !== 'update') {
      this.pendingOperation = 'select';
    }
    return this;
  }

  insert(data: any | any[]) {
    this.pendingOperation = 'insert';
    this.operationData = Array.isArray(data) ? data : [data];
    return this;
  }

  upsert(data: any | any[], _opts?: any) {
    this.pendingOperation = 'upsert';
    this.operationData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data: any) {
    this.pendingOperation = 'update';
    this.operationData = data;
    return this;
  }

  delete() {
    this.pendingOperation = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push(row => row[column] === value || String(row[column]) === String(value));
    return this;
  }

  or(condition: string) {
    const parts = condition.split(',');
    this.filters.push(row => {
      return parts.some(part => {
        const [col, op, val] = part.split('.');
        if (op === 'eq') return row[col] === val;
        if (op === 'is' && val === 'null') return row[col] == null;
        return true;
      });
    });
    return this;
  }

  order(_column: string, _opts?: any) {
    return this;
  }

  limit(count: number) {
    const origFilters = [...this.filters];
    this.filters = [
      (row: any) => {
        return origFilters.every(f => f(row));
      }
    ];
    return this;
  }

  private execute() {
    const table = testSupabaseDB[this.tableName] || [];

    if (this.pendingOperation === 'insert') {
      const inserted: any[] = [];
      for (const item of this.operationData) {
        const record = { id: item.id || `row-${Date.now()}-${Math.random()}`, ...item };
        table.push(record);
        inserted.push(record);
      }
      return { data: inserted, error: null };
    }

    if (this.pendingOperation === 'upsert') {
      const results: any[] = [];
      for (const item of this.operationData) {
        const id = item.id || item.studentId || item.student_id;
        const idx = table.findIndex(r => (r.id && r.id === id) || (r.studentId && r.studentId === id) || (r.student_id && r.student_id === id));
        if (idx >= 0) {
          table[idx] = { ...table[idx], ...item };
          results.push(table[idx]);
        } else {
          const rec = { id: id || `rec-${Date.now()}`, ...item };
          table.push(rec);
          results.push(rec);
        }
      }
      return { data: results, error: null };
    }

    if (this.pendingOperation === 'update') {
      const updated: any[] = [];
      for (let i = 0; i < table.length; i++) {
        if (this.filters.every(f => f(table[i]))) {
          table[i] = { ...table[i], ...this.operationData };
          updated.push(table[i]);
        }
      }
      return { data: updated, error: null };
    }

    if (this.pendingOperation === 'delete') {
      const remaining = table.filter(row => !this.filters.every(f => f(row)));
      testSupabaseDB[this.tableName] = remaining;
      return { data: null, error: null };
    }

    // Select
    const rows = table.filter(row => this.filters.every(f => f(row)));
    return { data: rows, error: null };
  }

  async single() {
    const res = this.execute();
    const rows = res.data;
    if (!rows || rows.length === 0) {
      return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle() {
    const res = this.execute();
    const rows = res.data;
    if (!rows || rows.length === 0) {
      return { data: null, error: null };
    }
    return { data: rows[0], error: null };
  }

  then(resolve: any, reject?: any) {
    try {
      const res = this.execute();
      return Promise.resolve(res).then(resolve, reject);
    } catch (e) {
      if (reject) return reject(e);
      throw e;
    }
  }
}

export const mockSupabaseClient = {
  from: (table: string) => new MockQueryBuilder(table),
  auth: {
    signInWithOtp: async () => ({ error: null }),
    admin: {
      createUser: async () => ({ data: { user: { id: 'auth-user-id' } }, error: null })
    }
  }
};

vi.mock('../lib/supabase/server.js', () => ({
  getSupabaseAdmin: () => mockSupabaseClient,
  getOrCreateSchoolBySlugOrName: async (schoolName: string) => {
    let existing = testSupabaseDB.schools.find(s => s.name === schoolName || s.slug === schoolName);
    if (!existing) {
      existing = { id: `school-${Date.now()}`, name: schoolName, slug: schoolName.toLowerCase().replace(/\s+/g, '-'), status: 'active' };
      testSupabaseDB.schools.push(existing);
    }
    return existing;
  }
}));

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
    process.env.JWT_SECRET = 'test-jwt-secret-for-vitest-suite-2026';
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

  describe('Requirement 1 & 2: Token Verification, Secret Enforcement and Backdoor Elimination', () => {
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

    it('rejects expired tokens', () => {
      const secret = process.env.JWT_SECRET || 'test-jwt-secret-for-vitest-suite-2026';
      const expiredToken = jwt.sign(
        { id: 'user-expired', username: 'expired_user', role: 'admin' },
        secret,
        { expiresIn: -10 }
      );
      const decoded = verifyAuthToken(expiredToken);
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

  describe('Requirement 4: API Route Authentication & Health Status', () => {
    it('GET /api/health responds with health status and dbMode="supabase"', async () => {
      const res = await request(app).get('/api/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('database');
      expect(res.body).toHaveProperty('dbMode', 'supabase');
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

    it('GET /api/db/status returns database connection status', async () => {
      const res = await request(app).get('/api/db/status');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('dbMode');
      expect(res.body.dbMode).not.toBe('fallback');
      expect(res.body.dbMode).not.toBe('mysql');
    });

    it('GET /api/sync/logs returns an array of sync logs', async () => {
      const res = await request(app).get('/api/sync/logs');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Requirement 5: CRUD Endpoints and Direct Database Persistence Verification', () => {
    const testStudentId = `STU-TEST-${Date.now()}`;
    const testClassName = `Class-Test-${Date.now()}`;
    const testSubjectCode = `SUB-TEST-${Date.now()}`;
    const testStaffId = `STAFF-TEST-${Date.now()}`;

    it('POST /api/students creates a student with authenticated school admin and persists to Supabase', async () => {
      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a')
        .send({
          studentId: testStudentId,
          firstName: 'Kwame',
          lastName: 'Mensah',
          class: 'Basic 1',
          gender: 'Male',
          dateOfBirth: '2015-05-12',
          guardianName: 'Kofi Mensah',
          guardianPhone: '0240000000',
          school_id: 'school-uuid-a'
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('success', true);

      // Verify directly from Supabase mock store
      const { data: recordFromSupabase } = await mockSupabaseClient
        .from('students')
        .select('*')
        .eq('studentId', testStudentId)
        .maybeSingle();

      expect(recordFromSupabase).not.toBeNull();
      expect(recordFromSupabase?.studentId).toBe(testStudentId);
      expect(recordFromSupabase?.school_id).toBe('school-uuid-a');
    });

    it('GET /api/students returns students scoped to authenticated school', async () => {
      const res = await request(app)
        .get('/api/students?school_id=school-uuid-a')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.some((s: any) => s.studentId === testStudentId);
      expect(found).toBe(true);
    });

    it('CONFIRMS RLS: School B cannot read School A student data', async () => {
      const res = await request(app)
        .get('/api/students?school_id=school-uuid-b')
        .set('Authorization', `Bearer ${adminTokenSchoolB}`)
        .set('x-school-id', 'school-uuid-b');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const hasSchoolAStudent = res.body.some((s: any) => s.studentId === testStudentId);
      expect(hasSchoolAStudent).toBe(false);
    });

    it('POST /api/classes creates a class and persists to Supabase', async () => {
      const res = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a')
        .send({
          name: testClassName,
          level: 'Basic',
          capacity: 40,
          school_id: 'school-uuid-a'
        });

      expect([200, 201]).toContain(res.status);

      // Direct Supabase confirmation
      const { data: classRecord } = await mockSupabaseClient
        .from('classes')
        .select('*')
        .eq('name', testClassName)
        .maybeSingle();

      expect(classRecord).not.toBeNull();
      expect(classRecord?.name).toBe(testClassName);
    });

    it('POST /api/subjects creates a subject and persists to Supabase', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a')
        .send({
          name: 'Integrated Science',
          code: testSubjectCode,
          applicableClasses: ['Basic 1'],
          school_id: 'school-uuid-a'
        });

      expect([200, 201]).toContain(res.status);

      // Direct Supabase confirmation
      const { data: subRecord } = await mockSupabaseClient
        .from('subjects')
        .select('*')
        .eq('code', testSubjectCode)
        .maybeSingle();

      expect(subRecord).not.toBeNull();
      expect(subRecord?.code).toBe(testSubjectCode);
    });

    it('POST /api/teachers creates a teacher record and persists to Supabase', async () => {
      const res = await request(app)
        .post('/api/teachers')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a')
        .send({
          name: 'Teacher Yaw',
          staffId: testStaffId,
          phone: '0241111111',
          school_id: 'school-uuid-a'
        });

      expect([200, 201]).toContain(res.status);

      // Direct Supabase confirmation
      const { data: teacherRecord } = await mockSupabaseClient
        .from('teachers')
        .select('*')
        .eq('staffId', testStaffId)
        .maybeSingle();

      expect(teacherRecord).not.toBeNull();
      expect(teacherRecord?.staffId).toBe(testStaffId);
    });
  });
});
