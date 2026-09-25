/**
 * Two-Factor Authentication (2FA) Implementation
 * Provides TOTP-based 2FA for enhanced security, especially for admin accounts
 */

import { getSupabaseAdmin } from './supabase/server';
import crypto from 'crypto';

// Note: otplib and qrcode need to be installed via npm for full 2FA functionality
// These are optional dependencies - the system will function without them but with limited 2FA features

// Helper function to dynamically load otplib
async function loadOtplib() {
  try {
    const otplib = await import('otplib');
    return otplib.authenticator;
  } catch (error) {
    console.warn('otplib not installed, 2FA functionality will be limited');
    return null;
  }
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
 * Generate a secure TOTP secret
 */
export async function generateTOTPSecret(): Promise<string> {
  try {
    const authenticator = await loadOtplib();
    if (authenticator) {
      return authenticator.generateSecret();
    }
  } catch (error) {
    console.warn('Failed to generate TOTP secret with otplib');
  }
  // Fallback to crypto-based secret generation
  return crypto.randomBytes(20).toString('base64');
}

/**
 * Generate a QR code URI for TOTP setup
 */
export async function generateTOTPQRCodeURI(
  secret: string,
  username: string,
  serviceName: string = 'SchoolSphere'
): Promise<string> {
  try {
    const authenticator = await loadOtplib();
    if (authenticator) {
      return authenticator.keyuri(username, serviceName, secret);
    }
  } catch (error) {
    console.warn('Failed to generate TOTP QR URI with otplib');
  }
  // Fallback to manual URI construction
  return `otpauth://totp/${serviceName}:${username}?secret=${secret}&issuer=${serviceName}`;
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
 * Verify TOTP token
 */
export async function verifyTOTPToken(token: string, secret: string): Promise<boolean> {
  try {
    const authenticator = await loadOtplib();
    if (authenticator) {
      // @ts-ignore - otplib types may not match exactly
      return authenticator.verify(token, secret);
    }
  } catch (error) {
    console.warn('TOTP verification failed (otplib not available)');
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

    // If password provided, verify it (extra security)
    if (password) {
      const { data: user } = await adminClient
        .from('users')
        .select('password_hash')
        .eq('id', userId)
        .maybeSingle();

      if (user?.password_hash) {
        const bcrypt = (await import('bcryptjs')).default;
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
          return { success: false, error: 'Invalid password' };
        }
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