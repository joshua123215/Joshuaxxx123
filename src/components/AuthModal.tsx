import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, AlertCircle } from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { ADMIN_EMAILS } from '../utils/subscription';
import { recordNewSignupToServer } from '../utils/geo';
import { setDriveAccessToken } from '../utils/googleDrive';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Convert technical Firebase error codes into clear, human-readable messages
function formatAuthError(err: any): string | null {
  if (!err) return null;
  const code = err.code || '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by your browser. Please allow popups or use Email & Password below.';
    case 'auth/unauthorized-domain':
      return `Google Sign-In is not enabled for ${typeof window !== 'undefined' ? window.location.hostname : 'this domain'} yet. Please use Email & Password below, or add this domain in Firebase Auth settings.`;
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase Authentication settings. Please try Google Sign-In or enable Email/Password in Firebase Console.';
    case 'auth/user-not-found':
      return 'No account exists with this email. Please check your spelling or sign up.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please verify your credentials.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email. Please switch to Sign In.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/network-request-failed':
      return 'Network connection issue. Please check your internet connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    default: {
      const msg = err.message || 'An error occurred during authentication.';
      return msg.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?/i, '').trim();
    }
  }
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const saveUserToFirestore = async (user: any) => {
    if (!user || !user.uid) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userEmail = (user.email || '').toLowerCase().trim();
      const isAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);

      const existingSnap = await getDoc(userRef);
      if (!existingSnap.exists()) {
        await setDoc(userRef, {
          email: user.email || null,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          photoURL: user.photoURL || null,
          displayName: user.displayName || null,
          role: isAdmin ? 'admin' : 'user',
        });
        recordNewSignupToServer().catch(() => {});
      } else {
        await setDoc(userRef, {
          email: user.email || null,
          lastLoginAt: serverTimestamp(),
          photoURL: user.photoURL || null,
          displayName: user.displayName || null,
        }, { merge: true });
      }
    } catch (err) {
      console.warn('Firestore user profile sync skipped (non-fatal):', err);
    }
  };

  // Handle redirect sign-in result once on mount (for top-level mobile browsers)
  useEffect(() => {
    let isMounted = true;
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user && isMounted) {
          await saveUserToFirestore(result.user);
          onCloseRef.current();
        }
      })
      .catch((err) => {
        if (isMounted) {
          const formatted = formatAuthError(err);
          if (formatted) setError(formatted);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      await saveUserToFirestore(userCredential.user);
      onClose();
    } catch (err: any) {
      const formatted = formatAuthError(err);
      if (formatted) setError(formatted);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(userCredential);
      if (credential?.accessToken) {
        setDriveAccessToken(credential.accessToken);
      }
      await saveUserToFirestore(userCredential.user);
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setLoading(false);
        return;
      }

      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
      if (err.code === 'auth/popup-blocked' && !isInIframe) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch {
          setError('Sign-in popup was blocked. Please allow popups or use Email & Password below.');
        }
      } else {
        const formatted = formatAuthError(err);
        if (formatted) setError(formatted);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#111111] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-0.5">
              {isSignUp ? 'Free Account Registration' : 'Account Access'}
            </div>
            <h2 className="text-xl font-bold text-white">
              {isSignUp ? 'Create Free Account' : 'Sign In'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isSignUp 
                ? 'Free access to news bookmarks, saved articles & AI video automation.'
                : 'Sign in to access your saved articles, profile, and video studio.'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all ml-3 flex-shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-400 pl-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-400 pl-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Or continue with</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>

          <button 
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-black font-semibold py-3 rounded-xl transition-all disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>

          <p className="mt-6 text-center text-sm text-gray-400">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-blue-500 hover:text-blue-400 font-medium transition-colors"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
