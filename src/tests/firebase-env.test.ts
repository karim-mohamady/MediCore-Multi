import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  evaluateFirebaseEnvironment,
  canConnectLiveFirebase,
  shouldDefaultToDemoMode,
} from '../lib/firebaseEnv';

describe('MediCore Firebase Environment Separation & Release Safety', () => {
  it('E1: Defaults to safe DEMO mode when no environment variables are set', () => {
    const res = evaluateFirebaseEnvironment({});
    assert.equal(res.targetMode, 'demo');
    assert.equal(res.isEmulatorActive, false);
    assert.equal(res.isStagingLocked, false);
    assert.equal(res.hasCompleteCloudConfig, false);
    assert.equal(res.isValid, true);
    assert.equal(shouldDefaultToDemoMode(res), true);
  });

  it('E2: Activates EMULATOR mode cleanly when VITE_USE_FIREBASE_EMULATOR=true on loopback', () => {
    const res = evaluateFirebaseEnvironment({
      VITE_USE_FIREBASE_EMULATOR: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-medicore',
    });
    assert.equal(res.targetMode, 'emulator');
    assert.equal(res.isEmulatorActive, true);
    assert.equal(res.isStagingLocked, false);
    assert.equal(res.isValid, true);
    assert.equal(res.emulatorHosts.firestoreHost, '127.0.0.1');
    assert.equal(res.emulatorHosts.firestorePort, 8080);
    assert.equal(res.emulatorHosts.authUrl, 'http://127.0.0.1:9099');
  });

  it('E3: Rejects non-loopback FIRESTORE and AUTH emulator hosts to prevent remote traffic redirection', () => {
    const resFs = evaluateFirebaseEnvironment({
      VITE_USE_FIREBASE_EMULATOR: 'true',
      FIRESTORE_EMULATOR_HOST: 'remote-attacker.example.com:8080',
    });
    assert.equal(resFs.targetMode, 'emulator');
    assert.equal(resFs.isValid, false);
    assert.ok(resFs.errors.some((e) => e.includes('Unsafe FIRESTORE_EMULATOR_HOST')));

    const resAuth = evaluateFirebaseEnvironment({
      VITE_USE_FIREBASE_EMULATOR: 'true',
      FIREBASE_AUTH_EMULATOR_HOST: 'http://10.0.0.5:9099',
    });
    assert.equal(resAuth.isValid, false);
    assert.ok(resAuth.errors.some((e) => e.includes('Unsafe FIREBASE_AUTH_EMULATOR_HOST')));
  });

  it('E4: Valid STAGING configuration locks Demo Mode off and validates all Web SDK fields', () => {
    const res = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'staging',
      VITE_USE_FIREBASE_EMULATOR: 'false',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingSyntheticValueOnly9988',
      VITE_FIREBASE_AUTH_DOMAIN: 'medicore-clinic-staging.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'medicore-clinic-staging',
      VITE_FIREBASE_STORAGE_BUCKET: 'medicore-clinic-staging.firebasestorage.app',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '987654321012',
      VITE_FIREBASE_APP_ID: '1:987654321012:web:stagingapp9988',
    });
    assert.equal(res.targetMode, 'staging');
    assert.equal(res.isEmulatorActive, false);
    assert.equal(res.isStagingLocked, true);
    assert.equal(res.hasCompleteCloudConfig, true);
    assert.equal(res.isValid, true);
    assert.equal(shouldDefaultToDemoMode(res), false);
  });

  it('E5: STAGING fails closed when completely empty or missing required keys', () => {
    const emptyStaging = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'staging',
    });
    assert.equal(emptyStaging.targetMode, 'staging');
    assert.equal(emptyStaging.isStagingLocked, true);
    assert.equal(emptyStaging.isValid, false);
    assert.equal(emptyStaging.projectId, 'unconfigured-staging');
    assert.equal(shouldDefaultToDemoMode(emptyStaging), false);
    assert.equal(emptyStaging.errors.length, 4);

    const missingAppId = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'staging',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingSyntheticValueOnly9988',
      VITE_FIREBASE_AUTH_DOMAIN: 'medicore-clinic-staging.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'medicore-clinic-staging',
    });
    assert.equal(missingAppId.isValid, false);
    assert.ok(missingAppId.errors.some((e) => e.includes('VITE_FIREBASE_APP_ID')));
  });

  it('E6: STAGING rejects guide/template placeholder values cleanly', () => {
    const res = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'staging',
      VITE_FIREBASE_API_KEY: 'AIzaSyYourProjectApiKey',
      VITE_FIREBASE_AUTH_DOMAIN: '<STAGING_PROJECT_ID>.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-medicore',
      VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef123456',
    });
    assert.equal(res.hasCompleteCloudConfig, false);
    assert.equal(res.isValid, false);
    assert.equal(res.errors.length, 4);
  });

  it('E7: STAGING rejects emulator flags/hosts or production-named projectId', () => {
    const res = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'staging',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      VITE_FIREBASE_API_KEY: 'AIzaSyValidLookingSyntheticKey1234',
      VITE_FIREBASE_AUTH_DOMAIN: 'medicore-prod.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'medicore-prod',
      VITE_FIREBASE_APP_ID: '1:111222333:web:999888777',
    });
    assert.equal(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes('forbids emulator flags')));
    assert.ok(res.errors.some((e) => e.includes('appears to reference production')));
  });

  it('E8: Blocks unsupported production tier (both production and prod)', () => {
    for (const tier of ['production', 'prod']) {
      const res = evaluateFirebaseEnvironment({ VITE_MEDICORE_ENV: tier });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes('blocked')));
    }
  });

  it('E9: Rejects inconsistent DEMO + active emulator combination and unknown VITE_MEDICORE_ENV values', () => {
    const conflict = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'demo',
      VITE_USE_FIREBASE_EMULATOR: 'true',
    });
    assert.equal(conflict.targetMode, 'demo');
    assert.equal(conflict.isEmulatorActive, false);
    assert.equal(conflict.isValid, false);
    assert.ok(conflict.errors.some((e) => e.includes('Inconsistent configuration')));

    const unknownTier = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'qa-unknown',
    });
    assert.equal(unknownTier.isValid, false);
    assert.ok(unknownTier.errors.some((e) => e.includes('Unsupported VITE_MEDICORE_ENV')));
  });

  it('E10: Rejects invalid authDomain with URL protocol scheme in STAGING', () => {
    const res = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'staging',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingSyntheticValueOnly9988',
      VITE_FIREBASE_AUTH_DOMAIN: 'https://medicore-clinic-staging.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'medicore-clinic-staging',
      VITE_FIREBASE_APP_ID: '1:987654321012:web:stagingapp9988',
    });
    assert.equal(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes('VITE_FIREBASE_AUTH_DOMAIN')));
  });

  it('E11: DEMO mode never activates cloud Firebase SDK even when complete cloud keys exist in env', () => {
    const demoWithKeys = evaluateFirebaseEnvironment({
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingSyntheticValueOnly9988',
      VITE_FIREBASE_AUTH_DOMAIN: 'medicore-clinic-staging.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'medicore-clinic-staging',
      VITE_FIREBASE_APP_ID: '1:987654321012:web:stagingapp9988',
    });
    assert.equal(demoWithKeys.targetMode, 'demo');
    assert.equal(demoWithKeys.hasCompleteCloudConfig, true);
    assert.equal(canConnectLiveFirebase(demoWithKeys), false);
    assert.equal(shouldDefaultToDemoMode(demoWithKeys), true);

    const emu = evaluateFirebaseEnvironment({
      VITE_USE_FIREBASE_EMULATOR: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-medicore',
    });
    assert.equal(canConnectLiveFirebase(emu), false);

    const validStaging = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'staging',
      VITE_USE_FIREBASE_EMULATOR: 'false',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingSyntheticValueOnly9988',
      VITE_FIREBASE_AUTH_DOMAIN: 'medicore-clinic-staging.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'medicore-clinic-staging',
      VITE_FIREBASE_APP_ID: '1:987654321012:web:stagingapp9988',
    });
    assert.equal(canConnectLiveFirebase(validStaging), true);
  });

  it('E12: Rejects underscore prod/production projectIds and non-false emulator flags in STAGING', () => {
    const res = evaluateFirebaseEnvironment({
      VITE_MEDICORE_ENV: 'staging',
      VITE_USE_FIREBASE_EMULATOR: '1',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingSyntheticValueOnly9988',
      VITE_FIREBASE_AUTH_DOMAIN: 'clinic_production.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'clinic_production',
      VITE_FIREBASE_APP_ID: '1:987654321012:web:stagingapp9988',
    });
    assert.equal(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes('forbids emulator flags')));
    assert.ok(res.errors.some((e) => e.includes('appears to reference production')));
    assert.equal(canConnectLiveFirebase(res), false);
  });

  it('E13: Staging pre-deploy guard fails closed on unknown CLI flags and missing --project value', () => {
    const unknownFlagRes = spawnSync('node', ['scripts/verify-staging-ready.mjs', '--unknown-flag'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.notEqual(unknownFlagRes.status, 0);
    assert.match(unknownFlagRes.stderr, /Unknown or unsupported CLI argument "--unknown-flag"/);

    const danglingProjectRes = spawnSync('node', ['scripts/verify-staging-ready.mjs', '--project'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.notEqual(danglingProjectRes.status, 0);
    assert.match(danglingProjectRes.stderr, /Missing project ID value after "--project" flag/);
  });

  it('E14: Staging pre-deploy guard rejects emulator hosts in process env and production/demo --project flags', () => {
    const prodFlagRes = spawnSync('node', ['scripts/verify-staging-ready.mjs', '--project', 'medicore-prod'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
    });
    assert.notEqual(prodFlagRes.status, 0);
    assert.match(prodFlagRes.stderr, /appears to target production/);
    assert.match(prodFlagRes.stderr, /Runtime environment variable FIRESTORE_EMULATOR_HOST is set/);
  });

  it('E15: Staging pre-deploy guard rejects conflicting duplicate --project flags to prevent override bypass', () => {
    const dupRes = spawnSync(
      'node',
      ['scripts/verify-staging-ready.mjs', '--project', 'medicore-prod', '--project', 'medicore-staging'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );
    assert.notEqual(dupRes.status, 0);
    assert.match(dupRes.stderr, /Duplicate "--project" flag is not allowed/);
    assert.match(dupRes.stderr, /appears to target production/);
  });
});
