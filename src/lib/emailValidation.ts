/**
 * Real-Time Enterprise Email Validation & Anti-Typo Engine
 * Provides RFC-compliant syntax checks, common domain typo detection with one-click corrections,
 * and disposable/temporary email provider filtering.
 */

export interface EmailValidationResult {
  isValid: boolean;
  normalizedEmail: string;
  syntaxError?: string;
  hasTypo: boolean;
  suggestedCorrection?: string;
  suggestedDomain?: string;
  isDisposable: boolean;
  disposableWarning?: string;
  domain?: string;
}

// Common reputable mail domains
const POPULAR_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'protonmail.com',
  'aol.com',
  'zoho.com'
];

// Direct typo mapping for fast, deterministic corrections
const DOMAIN_TYPO_MAP: Record<string, string> = {
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.co': 'gmail.com',
  'gmale.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmale.com': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yaho.co': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'ootlook.com': 'outlook.com',
  'iclud.com': 'icloud.com',
  'iclou.com': 'icloud.com',
  'protonmal.com': 'protonmail.com',
  'protonmai.com': 'protonmail.com',
  'prtonmail.com': 'protonmail.com'
};

// Known temporary and disposable throwaway email providers
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'trashmail.com',
  'yopmail.com',
  'sharklasers.com',
  'dispostable.com',
  'getnada.com',
  'fakeinbox.com',
  'throwawaymail.com',
  'maildrop.cc',
  'generator.email',
  'inboxkitten.com',
  'trashmail.net',
  'mailnesia.com',
  'nada.ltd',
  'mohmal.com',
  'dropmail.me',
  'crazymailing.com',
  'armyspy.com',
  'cuvox.de',
  'dayrep.com',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'teleworm.us',
  'mytemp.email'
]);

/**
 * Standard string normalization: trims leading/trailing spaces and lowercases.
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Levenshtein distance calculator to detect subtle domain misspellings
 */
function getLevenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Checks if a domain is a close misspelling of a popular domain.
 */
function detectDomainTypo(domain: string): string | null {
  if (DOMAIN_TYPO_MAP[domain]) {
    return DOMAIN_TYPO_MAP[domain];
  }

  // Check Levenshtein distance (distance of 1 for domains >= 5 chars)
  for (const popular of POPULAR_DOMAINS) {
    if (domain !== popular && Math.abs(domain.length - popular.length) <= 2) {
      const dist = getLevenshteinDistance(domain, popular);
      if (dist === 1) {
        return popular;
      }
    }
  }

  return null;
}

/**
 * Real-time validator for email inputs.
 */
export function validateEmail(rawEmail: string): EmailValidationResult {
  const normalized = normalizeEmail(rawEmail);

  if (!normalized) {
    return {
      isValid: false,
      normalizedEmail: '',
      hasTypo: false,
      isDisposable: false
    };
  }

  // Basic RFC 5322 regex check
  const rfcRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!rfcRegex.test(normalized)) {
    return {
      isValid: false,
      normalizedEmail: normalized,
      syntaxError: 'Please enter a valid email address (e.g. name@organization.com)',
      hasTypo: false,
      isDisposable: false
    };
  }

  const [localPart, domain] = normalized.split('@');

  if (!localPart || !domain) {
    return {
      isValid: false,
      normalizedEmail: normalized,
      syntaxError: 'Email must contain both username and domain parts',
      hasTypo: false,
      isDisposable: false
    };
  }

  if (localPart.length > 64) {
    return {
      isValid: false,
      normalizedEmail: normalized,
      syntaxError: 'Email username cannot exceed 64 characters',
      hasTypo: false,
      isDisposable: false
    };
  }

  if (normalized.length > 254) {
    return {
      isValid: false,
      normalizedEmail: normalized,
      syntaxError: 'Total email address cannot exceed 254 characters',
      hasTypo: false,
      isDisposable: false
    };
  }

  // Check for disposable address
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      isValid: false,
      normalizedEmail: normalized,
      syntaxError: 'Disposable email addresses are not permitted for enterprise security',
      hasTypo: false,
      isDisposable: true,
      disposableWarning: 'Temporary throwaway email addresses are blocked. Please provide an authentic work or educational email.',
      domain
    };
  }

  // Check for domain typo
  const typoCorrection = detectDomainTypo(domain);
  if (typoCorrection && typoCorrection !== domain) {
    const suggestedEmail = `${localPart}@${typoCorrection}`;
    return {
      isValid: true, // structurally valid, but typo detected
      normalizedEmail: normalized,
      hasTypo: true,
      suggestedCorrection: suggestedEmail,
      suggestedDomain: typoCorrection,
      isDisposable: false,
      domain
    };
  }

  return {
    isValid: true,
    normalizedEmail: normalized,
    hasTypo: false,
    isDisposable: false,
    domain
  };
}

/**
 * Backwards-compatibility helper for syntax validation
 */
export function validateEmailSyntax(email: string): EmailValidationResult {
  return validateEmail(email);
}

/**
 * Backwards-compatibility helper for backend email verification
 */
export async function verifyEmailWithBackend(email: string): Promise<EmailValidationResult> {
  const localResult = validateEmail(email);
  if (!localResult.isValid) return localResult;
  try {
    const res = await fetch(`/api/email/verify?email=${encodeURIComponent(localResult.normalizedEmail)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        ...localResult,
        isValid: data.isValid !== false,
        syntaxError: data.error || localResult.syntaxError
      };
    }
  } catch {}
  return localResult;
}
