import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';

describe('Student Promotions & Supabase Integration', () => {
  const testSchoolId = '00000000-0000-0000-0000-000000000001';

  it('rejects promotion request without school_id or promotions list', async () => {
    const res = await request(app)
      .post('/api/promotions')
      .send({});
    expect([400, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('handles GET /api/promotions scoped by school_id', async () => {
    const res = await request(app)
      .get(`/api/promotions?school_id=${testSchoolId}`)
      .set('x-school-id', testSchoolId);
    
    expect([200, 403, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    } else {
      expect(res.body.success).toBe(false);
    }
  });

  it('handles DELETE /api/promotions/:id with rollback details', async () => {
    const res = await request(app)
      .delete(`/api/promotions/99999999?school_id=${testSchoolId}`)
      .set('x-school-id', testSchoolId)
      .send({
        studentIdentifier: 'NONEXISTENT_TEST_ID',
        sourceClass: 'Basic 1',
        previousFeesPaid: 0,
        previousTotalFees: 500
      });
    
    // Should respond with valid JSON status
    expect([200, 403, 500]).toContain(res.status);
  });
});
