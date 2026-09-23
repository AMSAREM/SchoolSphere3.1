/**
 * Telemetry and session audit logger for multi-tenant authentication.
 */

export async function recordUserLogin(params: {
  auth_user_id?: string;
  organization_id?: string;
  email: string;
  status?: string;
}): Promise<void> {
  try {
    if (!params.email) return;

    await fetch('/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_user_id: params.auth_user_id,
        organization_id: params.organization_id,
        email: params.email.trim().toLowerCase(),
        status: params.status || 'success'
      })
    });
  } catch (err) {
    // Non-blocking telemetry
    console.debug('[Telemetry] Notice recording login:', err);
  }
}

/**
 * Maps raw Supabase Auth or server error strings to clear, user-friendly instructions.
 */
export function mapAuthErrorMessage(rawError: string | null | undefined): string {
  if (!rawError) return 'An unexpected error occurred. Please try again.';

  const lower = rawError.toLowerCase();

  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'The email or password you entered is incorrect. Please check your credentials and try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email address has not been confirmed yet. Please check your inbox for the confirmation email.';
  }
  if (lower.includes('user already registered') || lower.includes('already exists') || lower.includes('already registered')) {
    return 'An account with this email address already exists. Please sign in or use a different email.';
  }
  if (lower.includes('password should be at least') || lower.includes('password must be at least')) {
    return 'Your password must contain at least 8 characters for security.';
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Too many login attempts. Please wait 60 seconds before trying again.';
  }
  if (lower.includes('invitation token not found') || lower.includes('invalid invitation')) {
    return 'The invite token is invalid or has expired. Please request a new invite link from your organization administrator.';
  }
  if (lower.includes('disposable temporary emails')) {
    return 'Temporary throwaway email addresses are not permitted. Please use an authentic organization email.';
  }
  if (lower.includes('tenant isolation violation')) {
    return 'You do not have permission to access resources belonging to a different organization.';
  }

  return rawError;
}
