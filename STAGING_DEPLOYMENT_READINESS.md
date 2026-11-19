# MediCore — Staging Deployment Readiness

**Status:** Pre-Deployment Local Checks Ready · Live Staging Blocked Pending Owner Configuration

---

## 1. Firebase Configuration & Artifact Audit

| Artifact | Purpose | Status | Audit Notes |
| :--- | :--- | :--- | :--- |
| `firebase.json` | Declares Firestore `rules`, `indexes`, and local loopback Emulators (`127.0.0.1:8080`, `127.0.0.1:9099`) | Verified | Valid JSON; no Hosting rewrite conflicts; Emulators explicitly disabled UI (`"enabled": false`) |
| `firestore.rules` | Multi-tenant RBAC, appointment slot locking, immutable finalized clinical records, `getAfter()` atomic payment batch coupling | Verified (635 lines) | Global default deny (`allow read, write: if false`); 0 weakened rules |
| `firestore.indexes.json` | 5 composite `COLLECTION`-scoped indexes (`appointments` x2, `queues`, `invoices`, `labResults`) | Verified | Valid JSON; ready for `firebase deploy --only firestore:indexes` |
| `.env.example` | Safe template defaulting to `VITE_MEDICORE_ENV="demo"` with placeholder Staging Web SDK variables | Verified | Contains zero real credentials; `.env*` (`!.env.example`) ignored in `.gitignore` |
| `.gitignore` | Excludes `.env*`, `dist/`, `.firebase/`, `test-results/`, `playwright-report/`, `*.log` | Verified | Prevents accidental credential/artifact commits |
| `public/` | Static public directory copied directly into `dist/` during Vite build | Verified Clean | Unused chat archive (`Alomana___The_Enterprise_AI_Platform_80c97b74.zip`) relocated outside `public/` to `/archive/` |
| `dist/` | Vite production build output | Verified Clean | Zero `.zip`, `.mhtml`, `.env`, `.key`, `.pem`, `.sql`, or log files; chunked lazy routes |

---

## 2. Automated Environment Guardrails (`src/lib/firebaseEnv.ts` & `src/lib/firebase.ts`)

1. **Three-Tier Isolation (`demo` | `emulator` | `staging`):**
   - When `VITE_MEDICORE_ENV` is unset or `"demo"`, `canConnectLiveFirebase()` and `isFirebaseConfigured()` strictly return `false`, initializing an inert placeholder Firebase config (`unconfigured-inert.invalid`) even if cloud environment keys happen to exist.
   - Emulator mode enforces loopback hosts only (`127.0.0.1`, `localhost`, `::1`) and prevents remote redirection.
   - Staging mode fails closed if placeholder strings (`MY_`, `example`, `<STAGING`, etc.) remain, if `projectId === "demo-medicore"`, if `projectId` matches production patterns (`-prod`, `_prod`, `production`), or if any emulator flag/host is active.
2. **Unsupported `production` Tier Block:**
   - `VITE_MEDICORE_ENV="production"` or `"prod"` throws validation failure inside `evaluateFirebaseEnvironment()` until dedicated production release sign-off.

---

## 3. Pre-Deployment Verification Script (`scripts/verify-staging-ready.mjs`)

Run via:

```bash
npm run staging:check -- --project <STAGING_PROJECT_ID>
# or before running firebase deploy:
npm run staging:deploy -- --project <STAGING_PROJECT_ID>
```

Checks performed automatically before any remote deployment:
- `firebase.json`, `firestore.rules`, and `firestore.indexes.json` exist and parse cleanly.
- `public/` and `dist/` contain zero `.zip`, `.mhtml`, `.env*`, `.key`, `.pem`, `.sql`, `.log`, or service-account files.
- `.env.local` exists, `VITE_MEDICORE_ENV="staging"`, `VITE_USE_FIREBASE_EMULATOR` is unset or `"false"`, required Web SDK fields contain no placeholders, and `VITE_FIREBASE_PROJECT_ID` is neither `demo-medicore` nor `prod`/`production`.
- If `--project <id>` or `.firebaserc` is supplied, verifies exact match against `.env.local`'s `VITE_FIREBASE_PROJECT_ID`.
- Verifies active Firebase CLI login (`firebase projects:list --json`).

---

## 4. Index Deployment & Post-Deploy Checklist

1. **Indexes Deploy First (Async Build Time):**
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes --project <STAGING_PROJECT_ID>
   ```
   Wait for composite indexes on `appointments`, `queues`, `invoices`, and `labResults` to transition from **Building** to **Enabled** in Firebase Console -> Firestore -> Indexes before executing live Staging E2E workflows.
2. **Post-Deploy Live Smoke Verification (Blocked Until Staging Project Exists):**
   - Sign in as `doctor` -> verify `doctor-room` visible & `billing` denied.
   - Sign in as `receptionist` -> book deterministic slot -> verify double-booking conflict throws rejection.
   - Sign in as `accountant` -> record atomic batch invoice payment -> verify `/payments` ledger document + updated invoice totals persist across hard reload.
   - Sign in as `patient` -> verify self-scoped `patient-portal` only (`dashboard` and `doctor-room` hidden & blocked).
   - Attempt cross-clinic document read -> confirm Firestore returns `PERMISSION_DENIED`.

---

## 5. Rollback Procedure

If a staging rules or index regression occurs after deployment:
1. Revert `firestore.rules` or `firestore.indexes.json` locally to the last validated baseline.
2. Re-run local emulator security & E2E verification before touching Staging:
   ```bash
   npx firebase-tools emulators:exec --only auth,firestore --project demo-medicore "npm run test:emulator && npm run test:e2e"
   ```
3. Redeploy only Firestore rules (`--only firestore:rules`) to restore protection immediately:
   ```bash
   npx firebase deploy --only firestore:rules --project <STAGING_PROJECT_ID>
   ```
4. Remove temporary `.env.local` if rotating compromised Staging Web keys, regenerate the Web App config in Firebase Console, and update Authorized Domains accordingly.
