export type MediCoreExecutionMode = 'demo' | 'emulator' | 'staging';

export interface FirebaseEnvEvaluation {
  targetMode: MediCoreExecutionMode;
  isEmulatorActive: boolean;
  isStagingLocked: boolean;
  hasCompleteCloudConfig: boolean;
  isValid: boolean;
  projectId: string;
  errors: string[];
  warnings: string[];
  emulatorHosts: {
    firestoreHost: string;
    firestorePort: number;
    authUrl: string;
  };
}

const PLACEHOLDER_PATTERN = /(MY_|your-|your_|YourProject|YourApp|FakeKey|example|placeholder|abcdef123456|replace_me|changeme|<STAGING)/i;
const PROD_PROJECT_PATTERN = /(^|[-_])(prod|production)([-_]|$)/i;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isTruthyFlag(value: unknown): boolean {
  return ['true', '1', 'yes'].includes(asTrimmedString(value).toLowerCase());
}

function isExplicitFalseFlag(value: unknown): boolean {
  return ['', 'false', '0', 'no'].includes(asTrimmedString(value).toLowerCase());
}

function isPlaceholder(value: string): boolean {
  return !value || PLACEHOLDER_PATTERN.test(value);
}

function isValidHostname(value: string): boolean {
  return Boolean(value) && value.includes('.') && !/\s/.test(value) && !/^https?:\/\//i.test(value);
}

function extractHostAndPort(rawHost: string, defaultHost: string, defaultPort: number): {
  host: string;
  port: number;
  url: string;
  isLoopback: boolean;
} {
  const cleaned = rawHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
  if (!cleaned) {
    return {
      host: defaultHost,
      port: defaultPort,
      url: `http://${defaultHost}:${defaultPort}`,
      isLoopback: true,
    };
  }

  let host = cleaned;
  let port = defaultPort;

  if (cleaned.startsWith('[')) {
    const closingIdx = cleaned.indexOf(']');
    if (closingIdx !== -1) {
      host = cleaned.slice(0, closingIdx + 1);
      const portPart = cleaned.slice(closingIdx + 1);
      if (portPart.startsWith(':')) {
        const parsed = Number(portPart.slice(1));
        if (!Number.isNaN(parsed) && parsed > 0) port = parsed;
      }
    }
  } else {
    const lastColon = cleaned.lastIndexOf(':');
    if (lastColon > -1) {
      host = cleaned.slice(0, lastColon);
      const parsed = Number(cleaned.slice(lastColon + 1));
      if (!Number.isNaN(parsed) && parsed > 0) port = parsed;
    }
  }

  return {
    host,
    port,
    url: `http://${host}:${port}`,
    isLoopback: LOOPBACK_HOSTS.has(host.toLowerCase()),
  };
}

/**
 * Pure validator separating DEMO, EMULATOR, and STAGING Firebase execution modes.
 * Fails closed whenever staging credentials are missing, placeholder-based,
 * mixed with emulator flags, contradictory, or point at an unintended project identity.
 */
export function evaluateFirebaseEnvironment(rawEnv: Record<string, unknown>): FirebaseEnvEvaluation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const declaredTier = asTrimmedString(rawEnv.VITE_MEDICORE_ENV).toLowerCase();
  const useEmulatorFlag = isTruthyFlag(rawEnv.VITE_USE_FIREBASE_EMULATOR);
  const rawEmulatorFlag = asTrimmedString(rawEnv.VITE_USE_FIREBASE_EMULATOR);
  const hasNonFalseEmulatorFlag = rawEmulatorFlag !== '' && !isExplicitFalseFlag(rawEmulatorFlag);
  const fsEmulatorRaw = asTrimmedString(rawEnv.FIRESTORE_EMULATOR_HOST);
  const authEmulatorRaw = asTrimmedString(rawEnv.FIREBASE_AUTH_EMULATOR_HOST);
  const hasEmulatorVars = useEmulatorFlag || Boolean(fsEmulatorRaw) || Boolean(authEmulatorRaw);

  if (declaredTier === 'production' || declaredTier === 'prod') {
    errors.push(
      'VITE_MEDICORE_ENV="production" is blocked in staging-prepared builds without explicit production release sign-off.'
    );
  } else if (declaredTier && !['demo', 'emulator', 'staging'].includes(declaredTier)) {
    errors.push(
      `Unsupported VITE_MEDICORE_ENV "${declaredTier}". Allowed values: demo, emulator, staging.`
    );
  }

  let targetMode: MediCoreExecutionMode = 'demo';
  if (declaredTier === 'staging') {
    targetMode = 'staging';
  } else if (declaredTier === 'demo') {
    targetMode = 'demo';
  } else if (declaredTier === 'emulator' || hasEmulatorVars) {
    targetMode = 'emulator';
  }

  if (declaredTier === 'demo' && (hasEmulatorVars || hasNonFalseEmulatorFlag)) {
    errors.push(
      'Inconsistent configuration: VITE_MEDICORE_ENV="demo" conflicts with active emulator flags (VITE_USE_FIREBASE_EMULATOR / *_EMULATOR_HOST).'
    );
  }

  const isEmulatorActive = targetMode === 'emulator' && hasEmulatorVars;
  const isStagingLocked = targetMode === 'staging';

  const apiKey = asTrimmedString(rawEnv.VITE_FIREBASE_API_KEY);
  const authDomain = asTrimmedString(rawEnv.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = asTrimmedString(rawEnv.VITE_FIREBASE_PROJECT_ID);
  const storageBucket = asTrimmedString(rawEnv.VITE_FIREBASE_STORAGE_BUCKET);
  const messagingSenderId = asTrimmedString(rawEnv.VITE_FIREBASE_MESSAGING_SENDER_ID);
  const appId = asTrimmedString(rawEnv.VITE_FIREBASE_APP_ID);

  const hasCompleteCloudConfig =
    !isPlaceholder(apiKey) &&
    !apiKey.includes(' ') &&
    !isPlaceholder(authDomain) &&
    isValidHostname(authDomain) &&
    !isPlaceholder(projectId) &&
    projectId !== 'demo-medicore' &&
    !isPlaceholder(appId);

  const parsedFs = extractHostAndPort(fsEmulatorRaw, '127.0.0.1', 8080);
  const parsedAuth = extractHostAndPort(authEmulatorRaw, '127.0.0.1', 9099);

  if (targetMode === 'emulator') {
    if (!hasEmulatorVars) {
      errors.push('Emulator mode requires VITE_USE_FIREBASE_EMULATOR="true" or emulator host variables.');
    }
    if (!parsedFs.isLoopback) {
      errors.push(
        `Unsafe FIRESTORE_EMULATOR_HOST "${parsedFs.host}". Only loopback hosts (127.0.0.1, localhost) are permitted.`
      );
    }
    if (!parsedAuth.isLoopback) {
      errors.push(
        `Unsafe FIREBASE_AUTH_EMULATOR_HOST "${parsedAuth.host}". Only loopback hosts (127.0.0.1, localhost) are permitted.`
      );
    }
    if (hasCompleteCloudConfig) {
      warnings.push(
        'Cloud Firebase credentials detected alongside Emulator mode; SDK remains locked to local loopback emulators.'
      );
    }
  }

  if (targetMode === 'staging') {
    if (hasEmulatorVars || hasNonFalseEmulatorFlag) {
      errors.push(
        'Staging mode forbids emulator flags (VITE_USE_FIREBASE_EMULATOR / *_EMULATOR_HOST must be unset or "false").'
      );
    }
    if (isPlaceholder(apiKey) || apiKey.includes(' ')) {
      errors.push('Missing or placeholder VITE_FIREBASE_API_KEY for staging.');
    }
    if (isPlaceholder(authDomain) || !isValidHostname(authDomain)) {
      errors.push('Missing or invalid VITE_FIREBASE_AUTH_DOMAIN for staging.');
    }
    if (isPlaceholder(projectId)) {
      errors.push('Missing or placeholder VITE_FIREBASE_PROJECT_ID for staging.');
    } else if (projectId === 'demo-medicore') {
      errors.push('Staging mode cannot use local emulator projectId "demo-medicore".');
    } else if (PROD_PROJECT_PATTERN.test(projectId)) {
      errors.push(
        `Staging projectId "${projectId}" appears to reference production; explicit separation is required.`
      );
    }
    if (isPlaceholder(appId)) {
      errors.push('Missing or placeholder VITE_FIREBASE_APP_ID for staging.');
    }
    if (isPlaceholder(storageBucket)) {
      warnings.push('VITE_FIREBASE_STORAGE_BUCKET is unset or placeholder.');
    }
    if (isPlaceholder(messagingSenderId)) {
      warnings.push('VITE_FIREBASE_MESSAGING_SENDER_ID is unset or placeholder.');
    }
  } else if (targetMode === 'demo') {
    if (hasCompleteCloudConfig) {
      warnings.push(
        'Cloud Firebase variables are present while VITE_MEDICORE_ENV defaults to "demo". Set VITE_MEDICORE_ENV="staging" for staging deployments.'
      );
    } else if (apiKey || projectId || authDomain || appId) {
      warnings.push(
        'Partial Firebase variables detected in DEMO mode; app stays isolated to local demo data.'
      );
    }
  }

  return {
    targetMode,
    isEmulatorActive,
    isStagingLocked,
    hasCompleteCloudConfig,
    isValid: errors.length === 0,
    projectId: projectId || (targetMode === 'staging' ? 'unconfigured-staging' : 'demo-medicore'),
    errors,
    warnings,
    emulatorHosts: {
      firestoreHost: parsedFs.host,
      firestorePort: parsedFs.port,
      authUrl: parsedAuth.url,
    },
  };
}

export function canConnectLiveFirebase(evaluation: FirebaseEnvEvaluation): boolean {
  return (
    evaluation.isValid &&
    evaluation.targetMode === 'staging' &&
    evaluation.hasCompleteCloudConfig &&
    !evaluation.isEmulatorActive
  );
}

export function shouldDefaultToDemoMode(evaluation: FirebaseEnvEvaluation): boolean {
  return evaluation.targetMode !== 'staging';
}
