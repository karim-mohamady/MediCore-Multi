import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail as firebaseSendPasswordReset,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { normalizeRole, AuthorizationError } from './permissions';
import { UserProfile } from '../types';

export class AccountSuspendedError extends Error {
  constructor(message: string) {
    super(`[ACCOUNT_SUSPENDED] ${message}`);
    this.name = 'AccountSuspendedError';
  }
}

export class ProfileMissingError extends Error {
  constructor(message: string) {
    super(`[PROFILE_MISSING] ${message}`);
    this.name = 'ProfileMissingError';
  }
}

/**
 * Retrieves the authoritative user profile and canonical role from /users/{uid}.
 * Validates that the account is active and holds a recognized role.
 */
export async function fetchAuthoritativeUserProfile(uid: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured()) return null;

  try {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      return null;
    }

    const data = userDocSnap.data();

    // Check account status
    if (data.status === 'suspended' || data.status === 'disabled') {
      throw new AccountSuspendedError('This user account has been suspended by administration.');
    }

    // Enforce canonical role allowlist (maps legacy 'admin' -> 'clinic_manager', rejects unknown roles)
    const canonicalRole = normalizeRole(String(data.role || ''));

    return {
      id: uid,
      clinicId: data.clinicId || '',
      role: canonicalRole,
      status: (data.status as 'active' | 'suspended' | 'disabled') || 'active',
      patientId: data.patientId,
      name: data.name || '',
      nameAr: data.nameAr || data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      specialty: data.specialty,
      specialtyAr: data.specialtyAr,
      branchId: data.branchId,
      licenseNumber: data.licenseNumber,
    };
  } catch (error) {
    if (error instanceof AccountSuspendedError || error instanceof AuthorizationError) {
      throw error;
    }
    console.error('Error fetching authoritative user profile:', error);
    throw error;
  }
}

function assertAuthConfigured(): void {
  if (!isFirebaseConfigured()) {
    throw new Error('[FIREBASE_UNCONFIGURED] Valid Firebase configuration is required for authentication.');
  }
}

/**
 * Sign in user with Firebase Auth and resolve authoritative profile.
 * Signs out immediately if account is suspended or lacks an active valid profile.
 */
export async function signIn(email: string, pass: string): Promise<UserProfile> {
  assertAuthConfigured();
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  try {
    const profile = await fetchAuthoritativeUserProfile(cred.user.uid);
    if (!profile) {
      throw new ProfileMissingError('User profile not provisioned in /users directory.');
    }
    return profile;
  } catch (err) {
    if (err instanceof AccountSuspendedError || err instanceof AuthorizationError) {
      await firebaseSignOut(auth);
    }
    throw err;
  }
}

/**
 * Register a new Firebase Auth credential (used before onboarding a clinic or linking patient portal).
 */
export async function registerAuthUser(email: string, pass: string): Promise<FirebaseUser> {
  assertAuthConfigured();
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  return cred.user;
}

/**
 * Sign out current user.
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Send password reset email.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  assertAuthConfigured();
  await firebaseSendPasswordReset(auth, email);
}

/**
 * Listen for Firebase Auth state changes and enforce active authoritative profile resolution.
 */
export function onAuthStateChanged(
  callback: (user: FirebaseUser | null, profile: UserProfile | null) => void,
  onError?: (error: Error) => void
): () => void {
  return firebaseOnAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const profile = await fetchAuthoritativeUserProfile(firebaseUser.uid);
        callback(firebaseUser, profile);
      } catch (err) {
        const resolvedError = err instanceof Error ? err : new Error(String(err));
        if (resolvedError instanceof AccountSuspendedError || resolvedError instanceof AuthorizationError) {
          await firebaseSignOut(auth).catch(() => {});
          callback(null, null);
        } else {
          callback(firebaseUser, null);
        }
        onError?.(resolvedError);
      }
    } else {
      callback(null, null);
    }
  });
}

