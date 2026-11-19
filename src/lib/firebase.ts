import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator, doc, getDocFromServer } from 'firebase/firestore';
import { evaluateFirebaseEnvironment, canConnectLiveFirebase, MediCoreExecutionMode } from './firebaseEnv';

const env =
  (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, unknown> }).env) ||
  (typeof process !== 'undefined' ? (process.env as Record<string, unknown>) : {}) ||
  {};

export const envEvaluation = evaluateFirebaseEnvironment(env);

const firebaseConfig = {
  apiKey: String(env.VITE_FIREBASE_API_KEY || ''),
  authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || ''),
  projectId: String(env.VITE_FIREBASE_PROJECT_ID || ''),
  storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET || ''),
  messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''),
  appId: String(env.VITE_FIREBASE_APP_ID || ''),
};

export const getExecutionEnvironmentMode = (): MediCoreExecutionMode => envEvaluation.targetMode;

export const isStagingLocked = (): boolean => envEvaluation.isStagingLocked;

export const isEmulatorMode = (): boolean => envEvaluation.isEmulatorActive;

export const isFirebaseConfigured = (): boolean => {
  if (!envEvaluation.isValid) return false;
  if (envEvaluation.targetMode === 'emulator') return envEvaluation.isEmulatorActive;
  if (envEvaluation.targetMode === 'staging') return canConnectLiveFirebase(envEvaluation);
  return false;
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let emulatorsConnected = false;

if (canConnectLiveFirebase(envEvaluation)) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
} else if (envEvaluation.isEmulatorActive && envEvaluation.isValid) {
  const emulatorConfig = {
    apiKey: 'AIzaSyFakeKeyForLocalEmulatorOnly123456',
    authDomain: `${envEvaluation.projectId}.firebaseapp.com`,
    projectId: envEvaluation.projectId,
    appId: '1:0000000000:web:localemulator0001',
  };
  app = getApps().length > 0 ? getApp() : initializeApp(emulatorConfig);
} else {
  // Unconfigured inert placeholder app so SDK imports never throw at module evaluation;
  // all Live/Staging Auth and Firestore paths stay blocked via isFirebaseConfigured() === false.
  const inertConfig = {
    apiKey: 'unconfigured-inert-placeholder',
    authDomain: 'unconfigured-inert.invalid',
    projectId: 'unconfigured-inert',
    appId: '1:0:web:0',
  };
  app = getApps().length > 0 ? getApp() : initializeApp(inertConfig);
}

auth = getAuth(app);
db = getFirestore(app);

if (envEvaluation.isEmulatorActive && envEvaluation.isValid && !emulatorsConnected) {
  const { firestoreHost, firestorePort, authUrl } = envEvaluation.emulatorHosts;

  try {
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    connectAuthEmulator(auth, authUrl, { disableWarnings: true });
    emulatorsConnected = true;
  } catch {
    // Already connected during HMR
    emulatorsConnected = true;
  }
}

export async function testConnection(): Promise<{ ok: boolean; offline: boolean; error?: string }> {
  if (!isFirebaseConfigured()) {
    return {
      ok: false,
      offline: false,
      error:
        envEvaluation.errors[0] ||
        'Firebase configuration missing or incomplete. Set valid VITE_FIREBASE_* values.',
    };
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { ok: true, offline: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('client is offline')) {
      return { ok: false, offline: true, error: 'Firestore client is offline. Check network or Firebase configuration.' };
    }
    // Permission denied on /test/connection still proves live network reachability to Firestore
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
      return { ok: true, offline: false };
    }
    return { ok: false, offline: false, error: msg };
  }
}

export { app, auth, db };
export default app;

