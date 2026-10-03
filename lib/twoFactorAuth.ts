/**
 * Two-Factor Authentication (2FA) Implementation
 * Provides TOTP-based 2FA for enhanced security, especially for admin accounts
 */

import { getSupabaseAdmin, createAuthenticatedSupabaseClient } from './supabase/server.ts';
import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (!cleaned) {
    return Buffer.from(input, 'utf8');
  }
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTOTPToken(secret: string, stepOffset: number = 0): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 1000000;
  return String(otp).padStart(6, '0');
}

// Helper function to dynamically load qrcode
async function loadQRCode() {
  try {
    const qrcode = await import('qrcode');
    return qrcode;
  } catch (error) {
    console.warn('qrcode not installed, QR code generation will be limited');
    return null;
  }
}

export interface TwoFactorSettings {
  user_id: string | number;
  school_id?: string | null;
  secret: string;
  enabled: boolean;
  backup_codes: string[];
  verified: boolean;
  created_at?: number;
  last_used_at?: number;
}

/**
 * Generate a secure TOTP secret (RFC 4648 Base32)
 */
export async function generateTOTPSecret(): Promise<string> {
  return encodeBase32(crypto.randomBytes(20));
}

/**
 * Generate a QR code URI for TOTP setup
 */
export async function generateTOTPQRCodeURI(
  secret: string,
  username: string,
  serviceName: string = 'SchoolSphere'
): Promise<string> {
  const encodedIssuer = encodeURIComponent(serviceName);
  const encodedAccount = encodeURIComponent(username);
  const encodedSecret = encodeURIComponent(secret);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${encodedSecret}&issuer=${encodedIssuer}`;
}

/**
 * Generate QR code as data URL
 */
export async function generateQRCodeDataURL(uri: string): Promise<string> {
  try {
    const qrcode = await loadQRCode();
    if (qrcode) {
      return await qrcode.toDataURL(uri);
    }
  } catch (error) {
    console.warn('QR code generation failed with qrcode library');
  }
  // Fallback: return the URI as a simple text representation
  console.warn('QR code generation failed, returning URI as fallback');
  return `data:text/plain;base64,${Buffer.from(uri).toString('base64')}`;
}

/**
 * Generate backup codes for 2FA recovery
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Verify TOTP token across ±1 time step window (RFC 6238)
 */
export async function verifyTOTPToken(token: string, secret: string): Promise<boolean> {
  const cleanToken = String(token || '').trim();
  if (!/^\d{6}$/.test(cleanToken) || !secret) {
    return false;
  }
  try {
    for (const offset of [-1, 0, 1]) {
      const candidate = generateTOTPToken(secret, offset);
      if (candidate === cleanToken) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Verify backup code
 */
export function verifyBackupCode(
  backupCode: string,
  storedBackupCodes: string[]
): { valid: boolean; remainingCodes?: string[] } {
  const normalizedInput = backupCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const codeIndex = storedBackupCodes.findIndex(
    code => code.toUpperCase().replace(/[^A-Z0-9]/g, '') === normalizedInput
  );

  if (codeIndex === -1) {
    return { valid: false };
  }

  // Remove used backup code
  const remainingCodes = [...storedBackupCodes];
  remainingCodes.splice(codeIndex, 1);

  return { valid: true, remainingCodes };
}

/**
 * Setup 2FA for a user
 */
export async function setupTwoFactorAuth(params: {
  userId: string | number;
  schoolId?: string | null;
}): Promise<{ success: boolean; secret?: string; qrCodeUri?: string; backupCodes?: string[]; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    const { userId, schoolId } = params;

    // Check if user already has 2FA enabled
    const { data: existing } = await adminClient
      .from('two_factor_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing && existing.enabled) {
      return { success: false, error: '2FA is already enabled for this user' };
    }

    // Generate new secret and backup codes
    const secret = await generateTOTPSecret();
    const backupCodes = generateBackupCodes();

    // Get user info for QR code
    const { data: user } = await adminClient
      .from('users')
      .select('username, email')
      .eq('id', userId)
      .maybeSingle();

    const username = user?.username || user?.email || 'user';
    const qrCodeUri = await generateTOTPQRCodeURI(secret, username);

    // Store or update 2FA settings (not enabled yet, needs verification)
    const settings: TwoFactorSettings = {
      user_id: userId,
      school_id: schoolId || null,
      secret,
      enabled: false,
      backup_codes: backupCodes,
      verified: false,
      created_at: Date.now()
    };

    if (existing) {
      await adminClient
        .from('two_factor_settings')
        .update(settings)
        .eq('user_id', userId);
    } else {
      await adminClient
        .from('two_factor_settings')
        .insert(settings);
    }

    return {
      success: true,
      secret,
      qrCodeUri,
      backupCodes
    };
  } catch (error: any) {
    console.error('2FA setup error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify and enable 2FA
 */
export async function verifyAndEnableTwoFactorAuth(params: {
  userId: string | number;
  token: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    const { userId, token } = params;

    // Get user's 2FA settings
    const { data: settings, error } = await adminClient
      .from('two_factor_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !settings) {
      return { success: false, error: '2FA settings not found' };
    }

    if (settings.enabled) {
      return { success: false, error: '2FA is already enabled' };
    }

    // Verify TOTP token
    const isValid = await verifyTOTPToken(token, settings.secret);
    if (!isValid) {
      return { success: false, error: 'Invalid verification code' };
    }

    // Enable 2FA
    await adminClient
      .from('two_factor_settings')
      .update({
        enabled: true,
        verified: true,
        updated_at: Date.now()
      })
      .eq('user_id', userId);

    return { success: true };
  } catch (error: any) {
    console.error('2FA verification error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Disable 2FA for a user
 */
export async function disableTwoFactorAuth(params: {
  userId: string | number;
  password?: string; // Optional password verification for security
}): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    const { userId, password } = params;

    // If password provided, verify via Supabase Auth signInWithPassword
    if (password) {
      const { data: user } = await adminClient
        .from('users')
        .select('email, auth_user_id')
        .eq('id', userId)
        .maybeSingle();

      let canonicalEmail = String(user?.email || '').trim().toLowerCase();
      if (user?.auth_user_id && adminClient.auth?.admin?.getUserById) {
        try {
          const { data: au } = await adminClient.auth.admin.getUserById(user.auth_user_id);
          if (au?.user?.email) {
            canonicalEmail = au.user.email.trim().toLowerCase();
          }
        } catch {}
      }

      if (!canonicalEmail) {
        return { success: false, error: 'Unable to verify user email for password check' };
      }

      const verifyClient = createAuthenticatedSupabaseClient(null);
      const { data: signRes, error: signErr } = await verifyClient.auth.signInWithPassword({
        email: canonicalEmail,
        password: String(password)
      });
      if (signErr || !signRes?.user?.id) {
        return { success: false, error: 'Invalid password' };
      }
    }

    // Disable 2FA
    await adminClient
      .from('two_factor_settings')
      .update({
        enabled: false,
        verified: false,
        updated_at: Date.now()
      })
      .eq('user_id', userId);

    return { success: true };
  } catch (error: any) {
    console.error('2FA disable error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify 2FA during login
 */
export async function verifyTwoFactorDuringLogin(params: {
  userId: string | number;
  token: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    const { userId, token } = params;

    // Get user's 2FA settings
    const { data: settings, error } = await adminClient
      .from('two_factor_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !settings) {
      return { success: false, error: '2FA settings not found' };
    }

    if (!settings.enabled) {
      return { success: false, error: '2FA is not enabled for this user' };
    }

    // Try TOTP verification first
    const totpValid = await verifyTOTPToken(token, settings.secret);
    if (totpValid) {
      // Update last used timestamp
      await adminClient
        .from('two_factor_settings')
        .update({ last_used_at: Date.now() })
        .eq('user_id', userId);
      
      return { success: true };
    }

    // Try backup code verification
    const backupResult = verifyBackupCode(token, settings.backup_codes);
    if (backupResult.valid) {
      // Update backup codes after use
      await adminClient
        .from('two_factor_settings')
        .update({ 
          backup_codes: backupResult.remainingCodes,
          last_used_at: Date.now()
        })
        .eq('user_id', userId);
      
      return { success: true };
    }

    return { success: false, error: 'Invalid verification code' };
  } catch (error: any) {
    console.error('2FA login verification error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if user has 2FA enabled
 */
export async function isTwoFactorEnabled(userId: string | number): Promise<boolean> {
  try {
    const adminClient = getSupabaseAdmin();
    const { data: settings } = await adminClient
      .from('two_factor_settings')
      .select('enabled')
      .eq('user_id', userId)
      .maybeSingle();

    return settings?.enabled || false;
  } catch (error) {
    return false;
  }
}

/**
 * Get user's 2FA settings (admin only)
 */
export async function getTwoFactorSettings(userId: string | number): Promise<{ success: boolean; settings?: any; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    const { data: settings, error } = await adminClient
      .from('two_factor_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    // Don't return the secret or backup codes for security
    if (settings) {
      const { secret, backup_codes, ...safeSettings } = settings;
      return { success: true, settings: safeSettings };
    }

    return { success: true, settings: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}