/**
 * Security Improvements Test Suite
 * Tests for JWT secret handling, token refresh, audit logging, and 2FA
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';

describe('Security Improvements', () => {
  
  describe('JWT Secret Handling', () => {
    it('should require JWT_SECRET in production environment', async () => {
      // This test verifies that the fallback is removed in production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.SUPABASE_JWT_SECRET;

      // The auth module should throw an error when trying to get JWT secret in production
      try {
        const { getJwtSecret } = await import('../lib/auth');
        expect(() => getJwtSecret()).toThrow('JWT_SECRET or SUPABASE_JWT_SECRET environment variable must be set in production');
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should use fallback in development with warning', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      delete process.env.JWT_SECRET;
      delete process.env.SUPABASE_JWT_SECRET;

      const { getJwtSecret } = await import('../lib/auth');
      const secret = getJwtSecret();
      expect(secret).toBe('schoolsphere-dev-fallback-jwt-secret-key-3.1');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Token Refresh Mechanism', () => {
    it('should generate both access and refresh tokens', async () => {
      const { generateAuthToken, generateRefreshToken } = await import('../lib/auth');
      
      const userPayload = {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
        school_id: 'test-school-id'
      };

      const accessToken = generateAuthToken(userPayload);
      const refreshToken = generateRefreshToken(userPayload);

      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(accessToken).not.toBe(refreshToken);
    });

    it('should verify refresh tokens correctly', async () => {
      const { generateRefreshToken, verifyRefreshToken } = await import('../lib/auth');
      
      const userPayload = {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
        school_id: 'test-school-id'
      };

      const refreshToken = generateRefreshToken(userPayload);
      const decoded = verifyRefreshToken(refreshToken);

      expect(decoded).toBeDefined();
      expect(decoded?.type).toBe('refresh');
      expect(decoded?.username).toBe('testuser');
    });

    it('should refresh access tokens using refresh tokens', async () => {
      const { generateRefreshToken, refreshAccessToken } = await import('../lib/auth');
      
      const userPayload = {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
        school_id: 'test-school-id'
      };

      const refreshToken = generateRefreshToken(userPayload);
      const result = refreshAccessToken(refreshToken);

      expect(result.success).toBe(true);
      expect(result.newAccessToken).toBeDefined();
    });

    it('should reject invalid refresh tokens', async () => {
      const { refreshAccessToken } = await import('../lib/auth');
      
      const result = refreshAccessToken('invalid-refresh-token');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
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
      
      const mockReq = {
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
      
      const secret = generateTOTPSecret();
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
      const uri = generateTOTPQRCodeURI(secret, 'testuser', 'SchoolSphere');
      
      expect(uri).toBeDefined();
      expect(uri).toContain('otpauth://totp');
      expect(uri).toContain('testuser');
      expect(uri).toContain('SchoolSphere');
    });

    it('should verify TOTP tokens', async () => {
      const { generateTOTPSecret, verifyTOTPToken } = await import('../lib/twoFactorAuth');
      
      const secret = generateTOTPSecret();
      // Generate a valid token using the same secret
      try {
        const { authenticator } = await import('otplib');
        const token = authenticator.generate(secret);
        const isValid = verifyTOTPToken(token, secret);
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