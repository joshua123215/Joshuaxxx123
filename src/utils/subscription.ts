import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { shouldShowSubscriptions, MIN_USERS_FOR_PAYWALL } from './geo';

export const ADMIN_EMAIL = 'joshuaocansey731@gmail.com';
export const ADMIN_EMAILS = [
  'joshuaocansey731@gmail.com',
  'joshuaocansey66@gmail.com'
];
export const MERCHANT_NAME = 'Global News';
export const MERCHANT_ACCOUNT = 'Global News Online';
export const GHANA_MOMO_NUMBER = '0507553110';
export const GHANA_MOMO_NETWORK = 'Telecel Cash';
export const GHANA_MOMO_NAME = 'Global News';
export const GHANA_MOMO_AMOUNT_GHS = 15;
export const GHANA_MOMO_AMOUNT_FORMATTED = 'GH₵ 15.00';
export const FREE_ARTICLE_LIMIT = 3;
export const FREE_TRIAL_ARTICLE_LIMIT = 3;
export const PASS_PRICE = 'GH₵ 15.00';
export const PASS_DURATION_DAYS = 30;
export { MIN_USERS_FOR_PAYWALL };

/**
 * Checks if monetization (paywalls, subscription passes) is currently enabled.
 * All payments have been removed from the platform. 100% free access for all users.
 */
export const isMonetizationActive = (_userPhone?: string | null): boolean => {
  return false;
};

// Clean up any legacy guest subscription key from previous tests
try {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('globalnews_guest_sub_expires');
  }
} catch (e) {
  // ignore
}

const GUEST_READ_ARTICLES_KEY = 'globalnews_read_articles_v1';

export interface UserSubscriptionState {
  isAdmin: boolean;
  isSubscribed: boolean;
  subscriptionExpiresAt: number | null;
  subscriptionTier: string | null;
  articlesReadThisMonth: number;
  remainingArticles: number;
}

export interface UserTrialState {
  isAdmin: boolean;
  isSubscribed: boolean;
  inTrial: boolean;
  isTrialOver: boolean;
  billingDue: boolean;
  articlesRead: number;
  remaining: number;
  limit: number;
}

/**
 * Checks if a user is the platform administrator.
 * Admins are EXEMPT from all charges and never paywalled.
 */
export const isAdminUser = (user: User | any | null): boolean => {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  return ADMIN_EMAILS.some(e => e.toLowerCase() === email) || user.role === 'admin';
};

export const isUserSubscribed = (_user: User | any | null, _userDocData?: any): boolean => {
  return true; // All payments removed - unlimited access for all users
};

/**
 * Gets the list of read article IDs for the current month/session.
 */
export const getReadArticles = (): string[] => {
  try {
    const raw = localStorage.getItem(GUEST_READ_ARTICLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    }
  } catch (e) {
    console.error('Error reading article count:', e);
  }
  return [];
};

export const getUserTrialState = (user: User | any | null, userDocData?: any): UserTrialState => {
  return {
    isAdmin: isAdminUser(user),
    isSubscribed: true,
    inTrial: false,
    isTrialOver: false,
    billingDue: false,
    articlesRead: userDocData?.articlesReadCount || 0,
    remaining: 9999,
    limit: 9999
  };
};

/**
 * Records an article view and determines if reading is permitted or blocked by paywall.
 * All articles are 100% free and unlimited.
 */
export const recordArticleRead = (
  _articleId: number | string,
  _user: User | any | null,
  _userDocData?: any
): { canRead: boolean; count: number; remaining: number; isTrialOver: boolean } => {
  return { canRead: true, count: 0, remaining: 9999, isTrialOver: false };
};



/**
 * Activates a 30-day All-Access Pass for GH₵ 15.00.
 * Saves strictly to Firestore for the authenticated user.
 */
export const activate30DayPass = async (
  user: User | any | null,
  paymentMethod: string = 'ghana_momo'
): Promise<number> => {
  const expiresAt = Date.now() + PASS_DURATION_DAYS * 24 * 60 * 60 * 1000;

  // Save to Firestore if user is authenticated
  if (user && user.uid) {
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(
        userRef,
        {
          isSubscribed: true,
          subscriptionTier: 'ghana_momo_pass',
          subscriptionExpiresAt: expiresAt,
          subscribedAt: serverTimestamp(),
          lastPayment: {
            amount: GHANA_MOMO_AMOUNT_GHS,
            currency: 'GHS',
            method: paymentMethod,
            timestamp: Date.now()
          }
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error updating user subscription in Firestore:', err);
    }
  }

  // Dispatch global event so all components refresh their subscription state
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('subscription-updated', { detail: { expiresAt } }));
  }
  return expiresAt;
};

/**
 * Formats time remaining on subscription into human-readable text.
 */
export const formatTimeRemaining = (expiresAt: number | null): string => {
  if (!expiresAt) return 'Inactive';
  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) return 'Expired';

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `${days} ${days === 1 ? 'day' : 'days'} remaining`;
  }
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} remaining`;
};
