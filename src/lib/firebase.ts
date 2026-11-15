import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

export const DEFAULT_GOOGLE_DRIVE_EMAIL = 'joshuaocansey731@gmail.com';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const databaseId = (firebaseConfig as Record<string, any>).firestoreDatabaseId;
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({
  login_hint: DEFAULT_GOOGLE_DRIVE_EMAIL,
  prompt: 'select_account',
});

export const messaging = async () => {
  const supported = await isSupported();
  if (supported) {
    return getMessaging(app);
  }
  return null;
};
