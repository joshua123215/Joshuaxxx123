import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Check, Lock, Sparkles, Loader2, ArrowRight, 
  AlertCircle, Shield, Mail, KeyRound, UserCheck, Phone, 
  Copy, CheckCheck, RefreshCw, Smartphone, ExternalLink, HelpCircle
} from 'lucide-react';
import { User, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { 
  ADMIN_EMAIL, 
  activate30DayPass, 
  isAdminUser, 
  isMonetizationActive,
  GHANA_MOMO_NUMBER, 
  GHANA_MOMO_NAME, 
  GHANA_MOMO_NETWORK,
  GHANA_MOMO_AMOUNT_FORMATTED 
} from '../utils/subscription';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onOpenAuth: () => void;
  reason?: string;
  onSuccess?: () => void;
}

export default function PaywallModal({
  isOpen,
  onClose,
  user,
  reason = "You have reached your free article limit for this month.",
  onSuccess
}: PaywallModalProps) {
  // Step state: 'signin' | 'momo_form' | 'waiting_approval' | 'success'
  const [step, setStep] = useState<'signin' | 'momo_form' | 'waiting_approval' | 'success'>('signin');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Ghana MoMo form details
  const [selectedNetwork, setSelectedNetwork] = useState<'telecel' | 'mtn' | 'at'>('telecel');
  const [userPhone, setUserPhone] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Waiting / Approval state
  const [currentTxId, setCurrentTxId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const pollIntervalRef = useRef<any>(null);

  // Check user state on open or change
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    if (user) {
      if (isAdminUser(user)) {
        // Admin is silently exempt!
        onClose();
        return;
      }
      if (step === 'signin') {
        setStep('momo_form');
      }
    } else {
      setStep('signin');
    }
    setAuthError('');
    setFormError('');
  }, [isOpen, user]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const isAdmin = isAdminUser(user);
  const monetizationActive = isMonetizationActive(userPhone);

  // If monetization is inactive (< 500 users or outside Ghana), show free community notice
  if (!isAdmin && !monetizationActive) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-3xl bg-green-500/10 border border-green-500/30 text-green-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <div className="inline-block px-3 py-1 bg-green-500/15 border border-green-500/30 text-green-300 text-xs font-bold rounded-full uppercase tracking-wider">
              Free Community Access
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight">
              Enjoy 100% Free Access
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              GlobalNews is completely free during our community launch phase. No subscriptions or payments are required!
            </p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-xs text-left text-gray-300 space-y-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span>Unlimited breaking news articles</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span>Ad-Free full movie streaming</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span>Full high-definition PDF & image exports</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-green-600 hover:bg-green-500 text-white font-extrabold rounded-2xl transition-all shadow-lg shadow-green-900/40 text-sm cursor-pointer"
          >
            Continue Reading Free
          </button>
        </div>
      </div>
    );
  }

  // If admin opens paywall, exempt them directly
  if (isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md bg-[#121212] border border-white/10 rounded-3xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-purple-500/20 text-purple-400 rounded-full flex items-center justify-center mx-auto">
            <UserCheck className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white">Administrator Access Verified</h3>
          <p className="text-gray-400 text-sm">
            All news and premium content are fully unlocked for your account. You are never charged.
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl transition-colors"
          >
            Continue Reading
          </button>
        </div>
      </div>
    );
  }

  const saveUserDoc = async (u: User) => {
    try {
      const userRef = doc(db, 'users', u.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          email: u.email,
          displayName: u.displayName || null,
          photoURL: u.photoURL || null,
          role: u.email === ADMIN_EMAIL ? 'admin' : 'user',
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        }, { merge: true });
      } else {
        await setDoc(userRef, {
          lastLoginAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.error('Error saving user profile:', e);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await saveUserDoc(cred.user);
      if (isAdminUser(cred.user)) {
        onClose();
        if (onSuccess) onSuccess();
        return;
      }
      setStep('momo_form');
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign in with Google.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthError('Please enter both email and password.');
      return;
    }
    setAuthError('');
    setAuthLoading(true);
    try {
      let cred;
      if (isSignUp) {
        cred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        cred = await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      await saveUserDoc(cred.user);
      if (isAdminUser(cred.user)) {
        onClose();
        if (onSuccess) onSuccess();
        return;
      }
      setStep('momo_form');
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCopyNumber = () => {
    navigator.clipboard.writeText(GHANA_MOMO_NUMBER);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2500);
  };

  // Start polling backend to check if Joshua approved via email or admin dashboard
  const startApprovalPolling = (txId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status?id=${txId}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.status === 'approved') {
          clearInterval(pollIntervalRef.current);
          handlePaymentApproved();
        } else if (data.status === 'rejected') {
          clearInterval(pollIntervalRef.current);
          setFormError('Payment was declined by administrator. Please verify that GH₵ 15.00 was transferred to 0507553110 and try again.');
          setStep('momo_form');
        }
      } catch (err) {
        console.error('Polling payment status error:', err);
      }
    }, 2500);
  };

  const handlePaymentApproved = async () => {
    try {
      const activeUser = user || auth.currentUser;
      await activate30DayPass(activeUser, 'ghana_momo');
      setStep('success');
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
      }, 2500);
    } catch (err) {
      console.error('Error activating pass upon approval:', err);
      setStep('success');
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
      }, 2500);
    }
  };

  // Submit payment request to server & owner email
  const handleSubmitGhanaPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const clean = userPhone.replace(/\D/g, '');
    if (clean.length < 9 || clean.length > 12) {
      setFormError('Please enter a valid Ghana phone number (e.g. 0541234567).');
      return;
    }

    setSubmitLoading(true);
    try {
      const activeUser = user || auth.currentUser;
      const userEmail = activeUser?.email || authEmail || 'anonymous@globalnews.site';
      const userId = activeUser?.uid || 'guest_' + Date.now();

      const response = await fetch('/api/payment/ghana-initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: clean,
          network: selectedNetwork,
          userEmail,
          userId,
          reference: transactionRef
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit payment.');
      }

      setCurrentTxId(data.transactionId);
      setStep('waiting_approval');
      startApprovalPolling(data.transactionId);

      // Record transaction to Firestore for real-time admin sync
      try {
        if (activeUser && activeUser.uid) {
          await setDoc(doc(db, 'transactions', data.transactionId), {
            id: data.transactionId,
            userId: activeUser.uid,
            userEmail,
            userPhone: clean,
            network: selectedNetwork,
            amountGhs: 15,
            reference: transactionRef || '',
            status: 'pending',
            createdAt: serverTimestamp(),
            recipientPhone: GHANA_MOMO_NUMBER,
            recipientName: GHANA_MOMO_NAME
          });
        }
      } catch (fsErr) {
        console.warn('Firestore transaction log (non-fatal):', fsErr);
      }
    } catch (err: any) {
      setFormError(err.message || 'Payment submission failed. Please try again.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Handle manual 6-digit unlock code input
  const handleVerifyUnlockCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode || manualCode.trim().length < 6 || !currentTxId) {
      setCodeError('Please enter the 6-digit code provided by the administrator.');
      return;
    }
    setCodeError('');
    setCodeLoading(true);
    try {
      const response = await fetch('/api/payment/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: currentTxId,
          code: manualCode.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Invalid code.');
      }

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      await handlePaymentApproved();
    } catch (err: any) {
      setCodeError(err.message || 'Invalid 6-digit code.');
    } finally {
      setCodeLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative max-h-[92vh] overflow-y-auto">
        {/* Glow ambient effects */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-yellow-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* STEP 4: SUCCESS */}
        {step === 'success' && (
          <div className="p-8 sm:p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto animate-bounce border border-green-500/30">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white">Payment Confirmed!</h3>
            <p className="text-gray-300 text-sm max-w-sm mx-auto">
              Your <strong className="text-white">30-Day All-Access Pass ({GHANA_MOMO_AMOUNT_FORMATTED})</strong> is now unlocked. Enjoy unlimited breaking news and ad-free movie streaming!
            </p>
            <div className="inline-block px-4 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-xs font-bold uppercase tracking-wider">
              Active for 30 Full Days
            </div>
          </div>
        )}

        {/* STEP 1: SIGN IN INTERRUPTION */}
        {step === 'signin' && (
          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-yellow-400 text-xs font-bold uppercase tracking-wider mb-3">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                Free to Sign Up &bull; Billing After Trial
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {isSignUp ? 'Create Your Free Account' : 'Sign In to Your Account'}
              </h2>
              <p className="text-gray-400 text-xs sm:text-sm mt-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>{reason || 'Signing up is free! Billing starts when your free trial is over, or pay early.'}</span>
              </p>
            </div>

            {/* Ghana Plan Info Badge */}
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-yellow-400 block">
                  Ghana 30-Day VIP Pass
                </span>
                <span className="text-2xl font-black text-white">{GHANA_MOMO_AMOUNT_FORMATTED}</span>
                <span className="text-xs text-gray-400 ml-1.5 font-medium">per month</span>
              </div>
              <div className="text-right text-xs text-gray-400 space-y-1">
                <div className="flex items-center gap-1 text-green-400 justify-end font-medium">
                  <Check className="w-3.5 h-3.5" /> Free 3-Article Trial
                </div>
                <div className="flex items-center gap-1 text-green-400 justify-end font-medium">
                  <Check className="w-3.5 h-3.5" /> Billing starts when trial ends
                </div>
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
                {authError}
              </div>
            )}

            {/* Google 1-Click Sign In */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="w-full py-3.5 px-4 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-2xl transition-all shadow-md flex items-center justify-center gap-3 text-sm disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{authLoading ? 'Signing In...' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center my-3">
                <div className="flex-1 border-t border-white/10" />
                <span className="px-3 text-xs text-gray-500 uppercase font-medium">Or with Email</span>
                <div className="flex-1 border-t border-white/10" />
              </div>

              {/* Email Form */}
              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 bg-[#1a1a1a] border border-white/10 rounded-xl px-3.5 py-2.5">
                    <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="Email address"
                      className="bg-transparent text-white text-sm w-full focus:outline-none placeholder-gray-500"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-3 bg-[#1a1a1a] border border-white/10 rounded-xl px-3.5 py-2.5">
                    <KeyRound className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Password"
                      className="bg-transparent text-white text-sm w-full focus:outline-none placeholder-gray-500"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold rounded-xl transition-colors text-sm shadow-md shadow-yellow-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {authLoading && <Loader2 className="w-4 h-4 animate-spin text-black" />}
                  <span>{isSignUp ? 'Create Account & Continue' : 'Sign In & Continue'}</span>
                </button>
              </form>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: GHANA MOBILE MONEY PAYMENT (AUTOMATED PROMPT CHECKOUT) */}
        {step === 'momo_form' && (
          <div className="p-5 sm:p-7 space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-yellow-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                <Smartphone className="w-3.5 h-3.5" />
                Automated Mobile Money Prompt
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Mobile Money Checkout
              </h2>
              <p className="text-gray-400 text-xs mt-1">
                Account: <span className="text-white font-medium">{user?.email || auth.currentUser?.email}</span>
              </p>
            </div>

            {/* Plan Info Badge */}
            <div className="bg-gradient-to-r from-[#1c1c1f] to-[#252528] border border-yellow-500/30 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-yellow-400 block">
                  30-Day VIP All-Access Pass
                </span>
                <span className="text-2xl font-black text-white">{GHANA_MOMO_AMOUNT_FORMATTED}</span>
                <span className="text-xs text-gray-400 ml-1.5 font-medium">one-time payment</span>
              </div>
              <div className="text-right text-xs text-gray-400 space-y-1">
                <div className="flex items-center gap-1 text-green-400 justify-end font-medium">
                  <Check className="w-3.5 h-3.5" /> Unlimited News
                </div>
                <div className="flex items-center gap-1 text-green-400 justify-end font-medium">
                  <Check className="w-3.5 h-3.5" /> Ad-Free Movie Streams
                </div>
              </div>
            </div>

            {/* Network Selector */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                1. Select Your Mobile Money Network:
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedNetwork('mtn')}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    selectedNetwork === 'mtn'
                      ? 'border-yellow-400 bg-yellow-400/15 text-white ring-1 ring-yellow-400 shadow-md'
                      : 'border-white/10 bg-[#181818] text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="text-xs font-bold">MTN MoMo</span>
                  <span className="text-[10px] text-gray-400">024 / 054 / 055</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedNetwork('telecel')}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    selectedNetwork === 'telecel'
                      ? 'border-red-500 bg-red-500/15 text-white ring-1 ring-red-500 shadow-md'
                      : 'border-white/10 bg-[#181818] text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-xs font-bold">Telecel Cash</span>
                  <span className="text-[10px] text-gray-400">Vodafone / 050</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedNetwork('at')}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    selectedNetwork === 'at'
                      ? 'border-blue-500 bg-blue-500/15 text-white ring-1 ring-blue-500 shadow-md'
                      : 'border-white/10 bg-[#181818] text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-xs font-bold">AT Money</span>
                  <span className="text-[10px] text-gray-400">AirtelTigo / 026</span>
                </button>
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Payment submission form */}
            <form onSubmit={handleSubmitGhanaPayment} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                  2. Enter Your Phone Number to Receive Prompt:
                </label>
                <div className="flex items-center gap-2.5 bg-[#181818] border border-white/10 rounded-xl px-3.5 py-3 focus-within:border-yellow-400 transition-colors">
                  <Phone className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <input
                    type="tel"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    placeholder="e.g. 054 123 4567 or 024xxxxxxx"
                    className="bg-transparent text-white text-base w-full focus:outline-none placeholder-gray-500 font-mono tracking-wider"
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-[#151515] border border-white/5 rounded-xl text-xs text-gray-300 space-y-1">
                <div className="flex items-center gap-2 text-yellow-400 font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>How it works:</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  When you tap <strong>"Pay GH₵ 15.00"</strong>, a popup prompt will appear directly on your phone screen asking for your Mobile Money PIN. Enter your PIN on your phone to authorize payment to <strong>Global News</strong>.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full py-4 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black rounded-2xl transition-all shadow-xl shadow-yellow-500/20 flex items-center justify-center gap-2 text-base disabled:opacity-50 mt-2 cursor-pointer"
              >
                {submitLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                    <span>Sending Prompt to Your Phone...</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-5 h-5 text-black" />
                    <span>Pay GH₵ 15.00 — Send MoMo PIN Prompt</span>
                    <ArrowRight className="w-4 h-4 text-black ml-1" />
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400 pt-0.5">
              <Shield className="w-3.5 h-3.5 text-green-400" />
              <span>Encrypted Direct MoMo Authorization &bull; Merchant: Global News</span>
            </div>
          </div>
        )}

        {/* STEP 3: LIVE PHONE PROMPT WAITING SCREEN (ZERO PERSONAL NUMBER SHOWN) */}
        {step === 'waiting_approval' && (
          <div className="p-6 sm:p-8 space-y-6 text-center">
            {/* Animated Phone USSD Prompt Mockup */}
            <div className="max-w-xs mx-auto bg-black border-2 border-yellow-500/60 rounded-3xl p-4 shadow-2xl relative overflow-hidden">
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-3" />
              
              <div className="bg-[#1a1a1e] border border-yellow-500/30 rounded-2xl p-4 text-left space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-yellow-400 uppercase tracking-wider border-b border-white/10 pb-2">
                  <span>📱 MoMo Prompt Sent</span>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-gray-300">
                    Authorize payment to <strong className="text-white">Global News</strong>?
                  </div>
                  <div className="text-lg font-black text-green-400 font-mono">
                    GH₵ 15.00
                  </div>
                </div>

                <div className="p-2.5 bg-black/60 rounded-xl border border-white/10 text-center">
                  <div className="text-[10px] text-gray-400 font-mono uppercase mb-1">
                    Enter Mobile Money PIN on phone:
                  </div>
                  <div className="text-xl tracking-widest text-yellow-400 font-mono font-black animate-pulse">
                    &bull; &bull; &bull; &bull;
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs font-bold rounded-full uppercase tracking-wider inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Awaiting PIN Authorization on Your Phone
              </span>
              <h3 className="text-2xl font-black text-white">
                Check Your Phone Screen
              </h3>
              <p className="text-gray-300 text-xs sm:text-sm max-w-sm mx-auto leading-relaxed">
                An authorization prompt has popped up on <strong className="text-yellow-400 font-mono">{userPhone}</strong>. Enter your Mobile Money PIN on your phone to complete your GH₵ 15.00 pass.
              </p>
            </div>

            {/* USSD Telecom Fallback Helper */}
            <div className="bg-[#161616] border border-white/10 rounded-2xl p-4 text-left text-xs space-y-2 max-w-sm mx-auto">
              <div className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-yellow-400" />
                <span>Didn't see the popup prompt on your phone?</span>
              </div>
              {selectedNetwork === 'mtn' ? (
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Dial <strong className="text-yellow-400 font-mono">*170#</strong> &gt; Select <strong className="text-white">6. My Wallet</strong> &gt; Select <strong className="text-white">3. My Approvals</strong> &gt; Enter your PIN to approve.
                </p>
              ) : selectedNetwork === 'telecel' ? (
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Dial <strong className="text-red-400 font-mono">*110#</strong> &gt; Select <strong className="text-white">6. My Approvals</strong> &gt; Enter PIN to approve GH₵ 15.00 to Global News.
                </p>
              ) : (
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Dial <strong className="text-blue-400 font-mono">*110#</strong> &gt; Select pending approvals and enter your PIN.
                </p>
              )}
            </div>

            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-300 text-xs max-w-sm mx-auto flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0 text-green-400" />
              <span>Listening in real time... Unlocks automatically upon approval!</span>
            </div>

            {/* Option to unlock with 6-digit confirmation code */}
            <div className="pt-2 border-t border-white/10 max-w-sm mx-auto text-left">
              {!showCodeInput ? (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowCodeInput(true)}
                    className="text-xs text-yellow-400 hover:text-yellow-300 underline font-medium cursor-pointer"
                  >
                    Have a 6-digit confirmation code? Enter it here
                  </button>
                </div>
              ) : (
                <form onSubmit={handleVerifyUnlockCode} className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                    Enter 6-Digit Unlock Code:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 123456"
                      className="flex-1 bg-[#222] border border-white/10 rounded-xl px-3 py-2 text-white text-center font-mono font-bold text-lg tracking-widest focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      type="submit"
                      disabled={codeLoading}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs rounded-xl disabled:opacity-50 cursor-pointer"
                    >
                      {codeLoading ? 'Verifying...' : 'Unlock'}
                    </button>
                  </div>
                  {codeError && (
                    <p className="text-xs text-red-400">{codeError}</p>
                  )}
                </form>
              )}
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                  setStep('momo_form');
                }}
                className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                &larr; Back to change phone number
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
