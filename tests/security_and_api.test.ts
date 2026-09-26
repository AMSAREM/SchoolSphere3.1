import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// In-Memory Supabase mock database for hermetic test execution
const { testSupabaseDB, mockSupabaseClient } = vi.hoisted(() => {
  const db: Record<string, any[]> = {
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
    fee_transactions: [],
    inventory_items: [],
    term_reports: [],
    users: []
  };

  class MockQueryBuilder {
    private tableName: string;
    private filters: Array<(row: any) => boolean> = [];
    private pendingOperation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    private operationData: any = null;

    constructor(table: string) {
      this.tableName = table;
      if (!db[this.tableName]) {
        db[this.tableName] = [];
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

    neq(column: string, value: any) {
      this.filters.push(row => row[column] !== value && String(row[column]) !== String(value));
      return this;
    }

    ilike(column: string, value: any) {
      const pattern = String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
      const regex = new RegExp(`^${pattern}$`, 'i');
      this.filters.push(row => regex.test(String(row[column] ?? '')));
      return this;
    }

    or(condition: string) {
      const parts = String(condition || '').split(',').map(p => p.trim()).filter(Boolean);
      this.filters.push(row => {
        return parts.some(part => {
          const tokens = part.split('.');
          if (tokens.length < 3) return false;
          const col = tokens[0];
          const op = tokens[1];
          const val = tokens.slice(2).join('.');
          if (op === 'eq') return row[col] === val || String(row[col]) === String(val);
          if (op === 'is' && val === 'null') return row[col] == null;
          if (op === 'ilike') {
            const pattern = String(val ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
            return new RegExp(`^${pattern}$`, 'i').test(String(row[col] ?? ''));
          }
          return false;
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
      const table = db[this.tableName] || [];

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
        db[this.tableName] = remaining;
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

  const client = {
    from: (table: string) => new MockQueryBuilder(table),
    rpc: async (_fn: string, _args: any) => ({ data: null, error: null }),
    auth: {
      signInWithOtp: async () => ({ error: null }),
      admin: {
        createUser: async () => ({ data: { user: { id: 'auth-user-id' } }, error: null }),
        updateUserById: async () => ({ data: { user: { id: 'auth-user-id' } }, error: null }),
        deleteUser: async () => ({ data: {}, error: null })
      }
    }
  };

  return { testSupabaseDB: db, mockSupabaseClient: client };
});

vi.mock('../lib/supabase/server.js', () => ({
  getSupabaseAdmin: () => mockSupabaseClient,
  getOrCreateSchoolBySlugOrName: async (schoolName: string) => {
    return testSupabaseDB.schools.find(s => s.name === schoolName || s.slug === schoolName) || null;
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

    it('authenticates creator using server-side CREATOR_PASSWORD environment variable', async () => {
      process.env.CREATOR_USERNAME = 'platform_creator';
      process.env.CREATOR_PASSWORD = 'ServerOnlyCreatorSecret2026!';
      process.env.CREATOR_EMAIL = 'creator@schoolsphere.app';

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'platform_creator',
          password: 'ServerOnlyCreatorSecret2026!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('creator');
      expect(res.body.user.username).toBe('platform_creator');
      expect(res.body.token).toBeDefined();
    });

    it('rejects creator login when invalid password is supplied', async () => {
      process.env.CREATOR_USERNAME = 'platform_creator';
      process.env.CREATOR_PASSWORD = 'ServerOnlyCreatorSecret2026!';

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'platform_creator',
          password: 'WrongPassword123'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
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

    it('GET /api/users REJECTS unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/users and GET /api/license/status REJECT forged Bearer JWT tokens with 403', async () => {
      const badToken = 'Bearer forged.jwt.signature_tampered_payload';

      const licRes = await request(app)
        .get('/api/license/status')
        .set('Authorization', badToken);
      expect([401, 403]).toContain(licRes.status);
      expect(licRes.body.success).toBe(false);

      const usersRes = await request(app)
        .get('/api/users')
        .set('Authorization', badToken);
      expect([401, 403]).toContain(usersRes.status);
      expect(usersRes.body.success).toBe(false);
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

    it('GET /robots.txt serves crawler directives with valid text/plain content', async () => {
      const res = await request(app).get('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toContain('User-agent:');
      expect(res.text).toContain('Sitemap:');
    });

    it('GET /sitemap.xml serves valid XML sitemap with indexable URLs', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/xml/);
      expect(res.text).toContain('urlset');
      expect(res.text).toContain('schoolsphere.app');
    });
  });

  // ============================================================================
  // 8. Tenant User Management (Supabase Provisioning + Role Auto-Linking + Scoping)
  // ============================================================================
  describe('8. Tenant User Management & Role Profile Auto-Linking', () => {
    const sharedUsername = `jmensah_${Date.now()}`;

    it('provisions a Teacher user in Supabase public.users and auto-links a Teacher profile in public.teachers', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a')
        .send({
          username: sharedUsername,
          fullName: 'John Mensah',
          email: `${sharedUsername}@schoola.edu`,
          phone: '0241234567',
          password: 'Password123!',
          role: 'teacher',
          status: 'active',
          assignedClasses: ['Basic 7'],
          subjects: ['Mathematics', 'Science'],
          school_id: 'school-uuid-a'
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe(sharedUsername);
      expect(res.body.user.role).toBe('teacher');
      expect(res.body.user.school_id).toBe('school-uuid-a');
      expect(res.body.linkedProfile).toBeDefined();
      expect(res.body.linkedProfile.type).toBe('teacher');

      // Confirm persisted in Supabase public.users
      const { data: userRows } = await mockSupabaseClient
        .from('users')
        .select('*')
        .eq('school_id', 'school-uuid-a');
      const persistedUser = (userRows || []).find((u: any) =>
        String(u.username || '').startsWith(sharedUsername)
      );
      expect(persistedUser).toBeDefined();

      // Confirm Teacher profile was auto-created in Supabase public.teachers
      const { data: teacherRows } = await mockSupabaseClient
        .from('teachers')
        .select('*')
        .eq('school_id', 'school-uuid-a');
      const linkedTeacher = (teacherRows || []).find((t: any) =>
        t.staffId === res.body.linkedProfile.staffId || t.email === `${sharedUsername}@schoola.edu`
      );
      expect(linkedTeacher).toBeDefined();
    });

    it('rejects duplicate username within the same tenant school with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a')
        .send({
          username: sharedUsername,
          fullName: 'Another John Mensah',
          password: 'Password123!',
          role: 'teacher',
          school_id: 'school-uuid-a'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('allows a different tenant school (School B) to create an account with the same plain username', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminTokenSchoolB}`)
        .set('x-school-id', 'school-uuid-b')
        .send({
          username: sharedUsername,
          fullName: 'John Mensah (School B)',
          password: 'SchoolBPass123!',
          role: 'student',
          class: 'Basic 8',
          gender: 'Male',
          school_id: 'school-uuid-b'
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe(sharedUsername);
      expect(res.body.user.school_id).toBe('school-uuid-b');
      expect(res.body.linkedProfile).toBeDefined();
      expect(res.body.linkedProfile.type).toBe('student');

      // Verify GET /api/users for School A and School B are isolated and return plain username
      const listA = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a');
      expect(listA.status).toBe(200);
      const userInA = (listA.body.users || []).find((u: any) => u.username === sharedUsername);
      expect(userInA).toBeDefined();
      expect(userInA.fullName).toBe('John Mensah');

      const listB = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminTokenSchoolB}`)
        .set('x-school-id', 'school-uuid-b');
      expect(listB.status).toBe(200);
      const userInB = (listB.body.users || []).find((u: any) => u.username === sharedUsername);
      expect(userInB).toBeDefined();
      expect(userInB.fullName).toBe('John Mensah (School B)');
    });

    it('allows newly provisioned tenant user to log in immediately with their plain username without mutating password_hash', async () => {
      const userBefore = testSupabaseDB.users.find((u: any) => u.school_id === 'school-uuid-a' && u.username === sharedUsername);
      expect(userBefore).toBeDefined();
      const originalHash = userBefore.password_hash;

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          username: sharedUsername,
          password: 'Password123!',
          schoolId: 'school-uuid-a'
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.token).toBeDefined();
      expect(loginRes.body.user.username).toBe(sharedUsername);
      expect(loginRes.body.user.role).toBe('teacher');

      // Verify password_hash in Supabase was NOT overwritten during login
      const userAfter = testSupabaseDB.users.find((u: any) => u.id === userBefore.id);
      expect(userAfter.password_hash).toBe(originalHash);
    });

    it('preserves existing license keys and user passwords untouched across GET /api/license/list, GET /api/schools, and invalid/demo login attempts', async () => {
      const originalLicenseKey = testSupabaseDB.school_licenses[0].license_key;
      const targetUser = testSupabaseDB.users.find((u: any) => u.school_id === 'school-uuid-a' && u.username === sharedUsername);
      const originalPasswordHash = targetUser.password_hash;

      const licListRes = await request(app).get('/api/license/list');
      expect(licListRes.status).toBe(200);
      expect(testSupabaseDB.school_licenses[0].license_key).toBe(originalLicenseKey);

      const schoolsRes = await request(app).get('/api/schools');
      expect(schoolsRes.status).toBe(200);
      expect(testSupabaseDB.school_licenses[0].license_key).toBe(originalLicenseKey);

      // Attempt login with demo123 or admin123 on existing user -> must be 401 and must NOT overwrite password_hash
      const badLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: sharedUsername,
          password: 'admin123',
          schoolId: 'school-uuid-a'
        });
      expect(badLogin.status).toBe(401);
      expect(targetUser.password_hash).toBe(originalPasswordHash);
    });

    it('updates user password via PUT /api/users/:id directly in Supabase and deletes user via DELETE /api/users/:id', async () => {
      const targetUser = testSupabaseDB.users.find((u: any) => u.school_id === 'school-uuid-a' && u.username === sharedUsername);
      expect(targetUser).toBeDefined();
      const oldHash = targetUser.password_hash;

      // Reset password via PUT /api/users/:id
      const updateRes = await request(app)
        .put(`/api/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a')
        .send({
          password: 'NewResetPass456!',
          school_id: 'school-uuid-a'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);

      const updatedUserInDb = testSupabaseDB.users.find((u: any) => u.id === targetUser.id);
      expect(updatedUserInDb.password_hash).not.toBe(oldHash);
      expect(updatedUserInDb.password_hash).toMatch(/^\$2[aby]\$/);

      // Verify login succeeds with new password
      const newLoginRes = await request(app)
        .post('/api/auth/login')
        .send({
          username: sharedUsername,
          password: 'NewResetPass456!',
          schoolId: 'school-uuid-a'
        });
      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.success).toBe(true);

      // Delete user via DELETE /api/users/:id
      const deleteRes = await request(app)
        .delete(`/api/users/${targetUser.id}?school_id=school-uuid-a`)
        .set('Authorization', `Bearer ${adminTokenSchoolA}`)
        .set('x-school-id', 'school-uuid-a');

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      const deletedCheck = testSupabaseDB.users.find((u: any) => u.id === targetUser.id);
      expect(deletedCheck).toBeUndefined();
    });

    it('GET /api/license/list excludes unlicensed records and deduplicates by both license key and school_id', async () => {
      // Inject an unlicensed row (empty key) and duplicate key/school rows into school_licenses
      testSupabaseDB.school_licenses.push(
        {
          id: 'lic-empty',
          school_id: 'school-uuid-b',
          license_key: '',
          school_name: 'School B College',
          active_status: 'active'
        },
        {
          id: 'lic-dup-key',
          school_id: 'school-uuid-c',
          license_key: 'TEST-LICENSE-KEY-A',
          school_name: 'Duplicate Key School',
          active_status: 'active'
        },
        {
          id: 'lic-dup-school',
          school_id: 'school-uuid-a',
          license_key: 'SECOND-KEY-FOR-SCHOOL-A',
          school_name: 'School A Academy',
          active_status: 'active'
        }
      );

      const res = await request(app).get('/api/license/list');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      // Every returned record must have a non-empty key
      for (const item of res.body) {
        expect(typeof item.key).toBe('string');
        expect(item.key.trim().length).toBeGreaterThan(0);
      }

      // Keys and school_ids must be strictly unique
      const keys = res.body.map((r: any) => r.key);
      expect(new Set(keys).size).toBe(keys.length);

      const schoolIds = res.body.map((r: any) => r.school_id).filter(Boolean);
      expect(new Set(schoolIds).size).toBe(schoolIds.length);
    });

    it('GET /api/schools/public exposes only public identity fields (id, name, slug, logo_url) and redacts contact/license fields', async () => {
      const res = await request(app).get('/api/schools/public');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.schools)).toBe(true);
      expect(res.body.schools.length).toBeGreaterThan(0);

      for (const s of res.body.schools) {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('slug');
        expect(s).toHaveProperty('logo_url');
        expect(s).not.toHaveProperty('email');
        expect(s).not.toHaveProperty('phone');
        expect(s).not.toHaveProperty('address');
        expect(s).not.toHaveProperty('license_id');
        expect(s).not.toHaveProperty('license_key');
        expect(s).not.toHaveProperty('key');
      }
    });

    it('POST /api/diagnostics/backend-suite executes schema_audit, fk_constraint_audit, attendance_uniqueness_probe, rbac_and_tenant_isolation_probe, and live CRUD rollback probes', async () => {
      const actions = [
        'schema_audit',
        'fk_constraint_audit',
        'attendance_uniqueness_probe',
        'rbac_and_tenant_isolation_probe',
        'crud_student_probe',
        'crud_academic_probe',
        'crud_user_autolink_probe',
        'license_and_rpc_audit'
      ];

      for (const action of actions) {
        const res = await request(app)
          .post('/api/diagnostics/backend-suite')
          .send({ action });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.action).toBe(action);
        expect(typeof res.body.summary).toBe('string');
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.length).toBeGreaterThan(0);

        if (action === 'schema_audit') {
          expect(Array.isArray(res.body.tables)).toBe(true);
          expect(res.body.tables.length).toBe(12);
          expect(res.body.tables.every((t: any) => t.exists === true)).toBe(true);
        }
      }

      // Confirm all temporary diagnostic schools were rolled back cleanly
      const leftoverDiagSchools = testSupabaseDB.schools.filter((s: any) =>
        String(s.slug || '').startsWith('diag-')
      );
      expect(leftoverDiagSchools.length).toBe(0);
    });
  });
});



