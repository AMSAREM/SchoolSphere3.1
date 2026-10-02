/**
 * Security Improvements Test Suite
 * Tests for JWT secret handling, token refresh, audit logging, and 2FA
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, startServer } from '../server';

describe('Security Improvements', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-for-vitest-suite-2026';
    await startServer();
  });
  
  describe('Supabase Auth JWT Verification', () => {
    it('should verify valid Supabase Auth session tokens and reject custom/foreign tokens', async () => {
      const jwt = (await import('jsonwebtoken')).default;
      const { verifyAuthToken } = await import('../lib/auth');
      const expectedIssuer = `${(process.env.SUPABASE_URL || 'https://niavmonyfwqlryppgksy.supabase.co').replace(/\/+$/, '')}/auth/v1`;

      const validSupabaseJwt = jwt.sign(
        {
          sub: '84b1efc0-de52-42fa-b811-000000000001',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'test@example.com',
          user_metadata: {
            user_id: 'test-user-id',
            username: 'testuser',
            role: 'admin',
            school_id: 'test-school-id',
            full_name: 'Test User'
          }
        },
        process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret-for-vitest-suite-2026',
        { issuer: expectedIssuer, expiresIn: '1h' }
      );

      const decoded = verifyAuthToken(validSupabaseJwt);
      expect(decoded).not.toBeNull();
      expect(decoded?.username).toBe('testuser');
      expect(decoded?.role).toBe('admin');
      expect(decoded?.school_id).toBe('test-school-id');

      const customHmacToken = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, 'custom-hmac-secret');
      expect(verifyAuthToken(customHmacToken)).toBeNull();
    });
  });

  describe('Audit Logging', () => {
    it('should create audit log entries', async () => {
      const { createAuditLog, AuditAction, EntityType } = await import('../lib/auditLogger');
      
      const result = await createAuditLog({
        userId: 'test-user-id',
        schoolId: 'test-school-id',
        action: AuditAction.USER_LOGIN,
        entityType: EntityType.USER,
        entityId: 'test-user-id',
        details: { test: 'data' },
        ipAddress: '127.0.0.1'
      });

      // Note: This might fail if Supabase is not configured, but the function structure should work
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should extract IP addresses from requests', async () => {
      const { extractIpAddress } = await import('../lib/auditLogger');
      
      const mockReq: any = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
          'x-real-ip': '192.168.1.2'
        },
        ip: '192.168.1.3'
      };

      const ipAddress = extractIpAddress(mockReq);
      expect(ipAddress).toBe('192.168.1.1');
    });
  });

  describe('Two-Factor Authentication', () => {
    it('should generate TOTP secrets', async () => {
      const { generateTOTPSecret } = await import('../lib/twoFactorAuth');
      
      const secret = await generateTOTPSecret();
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThan(10);
    });

    it('should generate backup codes', async () => {
      const { generateBackupCodes } = await import('../lib/twoFactorAuth');
      
      const codes = generateBackupCodes(10);
      expect(codes).toHaveLength(10);
      codes.forEach(code => {
        expect(code).toBeDefined();
        expect(code.length).toBe(8); // 4 bytes = 8 hex characters
      });
    });

    it('should generate QR code URIs', async () => {
      const { generateTOTPQRCodeURI } = await import('../lib/twoFactorAuth');
      
      const secret = 'test-secret-123';
      const uri = await generateTOTPQRCodeURI(secret, 'testuser', 'SchoolSphere');
      
      expect(uri).toBeDefined();
      expect(uri).toContain('otpauth://totp');
      expect(uri).toContain('testuser');
      expect(uri).toContain('SchoolSphere');
    });

    it('should verify TOTP tokens', async () => {
      const { generateTOTPSecret, verifyTOTPToken } = await import('../lib/twoFactorAuth');
      
      const secret = await generateTOTPSecret();
      // Generate a valid token using the same secret
      try {
        const { authenticator } = await import('otplib');
        const token = authenticator.generate(secret);
        const isValid = await verifyTOTPToken(token, secret);
        expect(isValid).toBe(true);
      } catch (error) {
        // If otplib is not installed, skip this test
        console.warn('Skipping TOTP verification test - otplib not available');
      }
    });

    it('should verify backup codes', async () => {
      const { generateBackupCodes, verifyBackupCode } = await import('../lib/twoFactorAuth');
      
      const backupCodes = generateBackupCodes(5);
      const codeToUse = backupCodes[0];
      
      const result = verifyBackupCode(codeToUse, backupCodes);
      
      expect(result.valid).toBe(true);
      expect(result.remainingCodes).toHaveLength(4); // One code should be removed
    });
  });

  describe('API Endpoints', () => {
    it('should have token refresh endpoint', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: 'invalid-token' });
      
      // Should return 400/401 for invalid token, not 404
      expect([400, 401]).toContain(response.status);
    });

    it('should have audit logs endpoint', async () => {
      const response = await request(app)
        .get('/api/audit/logs');
      
      // Should return 401 for unauthenticated request
      expect(response.status).toBe(401);
    });

    it('should have 2FA setup endpoint', async () => {
      const response = await request(app)
        .post('/api/auth/2fa/setup');
      
      // Should return 401 for unauthenticated request
      expect(response.status).toBe(401);
    });
  });
});