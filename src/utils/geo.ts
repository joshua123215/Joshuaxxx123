/**
 * Geolocation & Platform Monetization Rules Utility
 * 
 * Rules:
 * 1. Subscriptions & paywalls are HIDDEN until total platform users reach 500 users.
 * 2. Payments & VIP passes are strictly restricted to users in GHANA only.
 * 3. Admins can preview/test Ghana paywalls via simulation mode.
 */

export const MIN_USERS_FOR_PAYWALL = 500;

export interface PlatformStatus {
  totalUsers: number;
  minUsersForPaywall: number;
  isThresholdReached: boolean;
  country: string;
  isGhana: boolean;
  isMonetizationActive: boolean; // true only if totalUsers >= 500 AND isGhana
  adminOverridePaywall: boolean;
}

let cachedStatus: PlatformStatus = {
  totalUsers: 1,
  minUsersForPaywall: MIN_USERS_FOR_PAYWALL,
  isThresholdReached: false,
  country: '',
  isGhana: false,
  isMonetizationActive: false,
  adminOverridePaywall: false
};

// Check if current browser timezone or locale points to Ghana
export const isGhanaLocaleOrTimezone = (): boolean => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && (tz === 'Africa/Accra' || tz.toLowerCase().includes('accra'))) {
      return true;
    }
  } catch {
    // ignore
  }

  try {
    const lang = (navigator.language || '').toLowerCase();
    if (lang.endsWith('-gh') || lang === 'ak' || lang === 'tw') {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
};

// Check if user phone number is a Ghanaian number (+233 or 02x, 05x, 03x)
export const isGhanaPhoneNumber = (phone?: string | null): boolean => {
  if (!phone) return false;
  const clean = phone.replace(/[\s\-()]/g, '');
  if (clean.startsWith('+233') || clean.startsWith('233')) return true;
  // Local 10-digit formats e.g. 050, 054, 055, 059, 024, 027, 020, etc.
  if (/^0[235]\d{8}$/.test(clean)) return true;
  return false;
};

// Check if admin has enabled local preview mode
export const getAdminPreviewOverride = (): boolean => {
  try {
    return localStorage.getItem('globalnews_admin_preview_paywall') === 'true';
  } catch {
    return false;
  }
};

export const setAdminPreviewOverride = (enabled: boolean): void => {
  try {
    if (enabled) {
      localStorage.setItem('globalnews_admin_preview_paywall', 'true');
    } else {
      localStorage.removeItem('globalnews_admin_preview_paywall');
    }
    window.dispatchEvent(new CustomEvent('platform-status-changed'));
  } catch {
    // ignore
  }
};

// Fetch current platform status from server with fallback
export const fetchPlatformStatus = async (): Promise<PlatformStatus> => {
  const localGhana = isGhanaLocaleOrTimezone();
  const adminOverride = getAdminPreviewOverride();

  try {
    const res = await fetch('/api/platform-status');
    if (res.ok) {
      const data = await res.json();
      const isGhana = data.isGhana || localGhana;
      const isThresholdReached = data.isThresholdReached || adminOverride;
      const isMonetizationActive = (isThresholdReached && isGhana) || adminOverride;

      cachedStatus = {
        totalUsers: data.totalUsers || 1,
        minUsersForPaywall: data.minUsersForPaywall || MIN_USERS_FOR_PAYWALL,
        isThresholdReached,
        country: data.country || (isGhana ? 'GH' : ''),
        isGhana,
        isMonetizationActive,
        adminOverridePaywall: data.adminOverridePaywall || adminOverride
      };

      window.dispatchEvent(new CustomEvent('platform-status-changed', { detail: cachedStatus }));
      return cachedStatus;
    }
  } catch {
    // If backend route unavailable, fallback to client signals
  }

  cachedStatus = {
    totalUsers: cachedStatus.totalUsers || 1,
    minUsersForPaywall: MIN_USERS_FOR_PAYWALL,
    isThresholdReached: adminOverride,
    country: localGhana ? 'GH' : '',
    isGhana: localGhana,
    isMonetizationActive: adminOverride,
    adminOverridePaywall: adminOverride
  };

  return cachedStatus;
};

// Synchronous getter for current cached status
export const getCachedPlatformStatus = (): PlatformStatus => cachedStatus;

// Helper to determine if subscriptions/paywall should be shown (All payments removed)
export const shouldShowSubscriptions = (_userPhone?: string | null): boolean => {
  return false;
};

// Report user count from Firestore (called by admin dashboard)
export const syncUserCountToServer = async (count: number): Promise<void> => {
  try {
    await fetch('/api/platform-status/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
  } catch {
    // ignore
  }
};

// Report new signup
export const recordNewSignupToServer = async (): Promise<void> => {
  try {
    await fetch('/api/platform-status/record-signup', { method: 'POST' });
  } catch {
    // ignore
  }
};
