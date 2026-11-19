#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const args = process.argv.slice(2);

const failures = [];
const warnings = [];
const passed = [];

let cliProject = '';
let hasCliProject = false;
let deployCheckMode = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--deploy-check') {
    deployCheckMode = true;
    continue;
  }
  if (arg === '--project') {
    const nextVal = args[i + 1];
    if (!nextVal || nextVal.startsWith('-')) {
      failures.push('Missing project ID value after "--project" flag.');
    } else if (hasCliProject) {
      failures.push('Duplicate "--project" flag is not allowed; specify a single project ID.');
      i++;
    } else {
      cliProject = nextVal.trim();
      hasCliProject = true;
      i++;
    }
    continue;
  }
  if (arg.startsWith('--project=')) {
    const val = arg.slice('--project='.length).trim();
    if (!val || val.startsWith('-')) {
      failures.push('Empty or invalid project ID value in "--project=" flag.');
    } else if (hasCliProject) {
      failures.push('Duplicate "--project" flag is not allowed; specify a single project ID.');
    } else {
      cliProject = val;
      hasCliProject = true;
    }
    continue;
  }
  failures.push(`Unknown or unsupported CLI argument "${arg}". Allowed flags: --deploy-check, --project <id>.`);
}

function parseEnvFile(filePath) {
  const out = {};
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function scanDirectoryForBlockedFiles(relDir, disallowedExtensions) {
  const absDir = resolve(ROOT, relDir);
  if (!existsSync(absDir)) return [];
  const findings = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        const lower = entry.toLowerCase();
        const isEnv = lower === '.env' || (lower.startsWith('.env.') && lower !== '.env.example');
        const hasDisallowedExt = disallowedExtensions.some((ext) => lower.endsWith(ext));
        const looksLikeServiceAccount =
          lower.includes('service-account') ||
          lower.includes('serviceaccount') ||
          lower.includes('firebase-adminsdk');
        if (isEnv || hasDisallowedExt || looksLikeServiceAccount) {
          findings.push(full.replace(`${ROOT}/`, ''));
        }
      }
    }
  }
  walk(absDir);
  return findings;
}

console.log('=== MediCore Firebase Staging Pre-Deployment Safety Guard ===');

// 1. Verify required Firebase configuration artifacts exist & parse cleanly
for (const cfg of ['firebase.json', 'firestore.rules', 'firestore.indexes.json']) {
  const abs = resolve(ROOT, cfg);
  if (!existsSync(abs)) {
    failures.push(`Missing required Firebase configuration file: ${cfg}`);
  } else if (cfg.endsWith('.json')) {
    try {
      JSON.parse(readFileSync(abs, 'utf8'));
      passed.push(`${cfg} exists and is valid JSON.`);
    } catch (err) {
      failures.push(`${cfg} is invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    passed.push(`${cfg} exists.`);
  }
}

// 2. Scan public/ and dist/ (if built) for archives, credentials, or logs
const publicViolations = scanDirectoryForBlockedFiles('public', ['.zip', '.mhtml', '.key', '.pem', '.sql', '.log']);
if (publicViolations.length > 0) {
  failures.push(`Blocked files found inside public/: ${publicViolations.join(', ')}`);
} else {
  passed.push('public/ contains zero archives, credential files, SQL dumps, or logs.');
}

if (existsSync(resolve(ROOT, 'dist'))) {
  const distViolations = scanDirectoryForBlockedFiles('dist', ['.zip', '.mhtml', '.key', '.pem', '.sql', '.log']);
  if (distViolations.length > 0) {
    failures.push(`Blocked files found inside dist/: ${distViolations.join(', ')}`);
  } else {
    passed.push('dist/ contains zero archives, credential files, SQL dumps, or logs.');
  }
} else {
  warnings.push('dist/ does not exist yet — run "npm run build" before deploying Hosting.');
}

// 3. Check staging .env.local & runtime emulator env leakage (never print secret values)
const envLocalPath = resolve(ROOT, '.env.local');
const PLACEHOLDER_RE = /(MY_|your-|your_|YourProject|YourApp|FakeKey|example|placeholder|abcdef123456|replace_me|changeme|<STAGING)/i;
const PROD_RE = /(^|[-_])(prod|production)([-_]|$)/i;

if (cliProject) {
  if (cliProject === 'demo-medicore') {
    failures.push('--project cannot target local emulator project "demo-medicore".');
  } else if (PROD_RE.test(cliProject)) {
    failures.push(`--project "${cliProject}" appears to target production; aborting.`);
  }
}

for (const runtimeEmuKey of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'VITE_USE_FIREBASE_EMULATOR']) {
  const procVal = (process.env[runtimeEmuKey] || '').trim();
  if (
    procVal &&
    (runtimeEmuKey !== 'VITE_USE_FIREBASE_EMULATOR' || !['false', '0', 'no'].includes(procVal.toLowerCase()))
  ) {
    failures.push(`Runtime environment variable ${runtimeEmuKey} is set, which is forbidden for staging deployment.`);
  }
}

let envProjectId = '';
if (!existsSync(envLocalPath)) {
  failures.push('.env.local is missing (staging Firebase credentials are not configured).');
} else {
  const parsed = parseEnvFile(envLocalPath);
  const mode = (parsed.VITE_MEDICORE_ENV || '').toLowerCase();
  const emu = (parsed.VITE_USE_FIREBASE_EMULATOR || '').toLowerCase();
  envProjectId = parsed.VITE_FIREBASE_PROJECT_ID || '';

  if (mode !== 'staging') {
    failures.push(`Expected VITE_MEDICORE_ENV="staging" in .env.local (found "${mode || 'unset'}").`);
  } else {
    passed.push('VITE_MEDICORE_ENV is explicitly locked to "staging".');
  }

  if (emu !== '' && !['false', '0', 'no'].includes(emu)) {
    failures.push('VITE_USE_FIREBASE_EMULATOR must be "false" or unset for staging deployment.');
  } else {
    passed.push('VITE_USE_FIREBASE_EMULATOR is disabled.');
  }

  for (const emuHostKey of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    if ((parsed[emuHostKey] || '').trim() !== '') {
      failures.push(`${emuHostKey} must not be set inside .env.local for staging deployment.`);
    }
  }

  const requiredKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
  ];
  for (const key of requiredKeys) {
    const val = parsed[key] || '';
    if (!val || PLACEHOLDER_RE.test(val)) {
      failures.push(`${key} in .env.local is missing or still uses a placeholder value.`);
    }
  }

  const authDomain = (parsed.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  if (authDomain && (/^https?:\/\//i.test(authDomain) || /\s/.test(authDomain) || !authDomain.includes('.'))) {
    failures.push('VITE_FIREBASE_AUTH_DOMAIN in .env.local must be a valid hostname without http(s):// or whitespace.');
  }

  if (envProjectId === 'demo-medicore') {
    failures.push('VITE_FIREBASE_PROJECT_ID cannot be local emulator id "demo-medicore".');
  } else if (PROD_RE.test(envProjectId)) {
    failures.push(`VITE_FIREBASE_PROJECT_ID "${envProjectId}" looks like production; aborting.`);
  }

  if (cliProject && envProjectId && cliProject !== envProjectId) {
    failures.push(
      `Project ID mismatch: --project "${cliProject}" != .env.local VITE_FIREBASE_PROJECT_ID "${envProjectId}".`
    );
  }
}

// 4. Verify .firebaserc (if present) does not default to demo or prod
const firebasercPath = resolve(ROOT, '.firebaserc');
if (!existsSync(firebasercPath)) {
  warnings.push('.firebaserc is not present — pass explicit --project <STAGING_PROJECT_ID> when deploying.');
} else {
  try {
    const rc = JSON.parse(readFileSync(firebasercPath, 'utf8'));
    const defaultProj = rc?.projects?.default || rc?.projects?.staging || '';
    if (!defaultProj) {
      warnings.push('.firebaserc has no default or staging project alias.');
    } else if (defaultProj === 'demo-medicore' || PROD_RE.test(defaultProj)) {
      failures.push(`.firebaserc points to unsafe project "${defaultProj}".`);
    } else if (envProjectId && defaultProj !== envProjectId) {
      failures.push(`.firebaserc project "${defaultProj}" does not match .env.local "${envProjectId}".`);
    } else {
      passed.push(`.firebaserc target validated (${defaultProj}).`);
    }
  } catch (err) {
    failures.push(`.firebaserc is unreadable JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// 5. Check active Firebase CLI authentication (non-mutating)
const cliCheck = spawnSync('npx', ['--no-install', 'firebase', 'projects:list', '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 8000,
});
if (cliCheck.status !== 0) {
  failures.push('Firebase CLI is not authenticated or cannot list projects (run "npx firebase login" as project owner).');
} else {
  passed.push('Firebase CLI authentication verified.');
}

for (const msg of passed) console.log(`  [PASS] ${msg}`);
for (const msg of warnings) console.log(`  [WARN] ${msg}`);
for (const msg of failures) console.error(`  [FAIL] ${msg}`);

if (failures.length > 0) {
  console.error(`\nSTAGING GUARD BLOCKED (${failures.length} failure${failures.length === 1 ? '' : 's'}). No remote deployment allowed.`);
  process.exit(1);
}

console.log('\nSTAGING GUARD PASSED.');
if (deployCheckMode) {
  const target = cliProject || envProjectId;
  console.log(
    `Ready for explicit owner command:\n  npx firebase deploy --only firestore:rules,firestore:indexes --project ${target}`
  );
}
