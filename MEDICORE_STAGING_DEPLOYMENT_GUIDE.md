# MediCore SaaS — Firebase Staging Deployment Guide

> **Preparation vs. Execution Status:** This guide is a **prepared runbook**. No live Firebase staging project has been provisioned, and no cloud rules/indexes have been deployed from this workspace yet. Replace `<STAGING_PROJECT_ID>` placeholders only after obtaining explicit owner approval for a dedicated non-production Firebase project.
>
> **CRITICAL SAFETY WARNING:** **NEVER** connect Staging to Production Firebase credentials, **NEVER** copy or import real patient records (PHI), and **NEVER** reuse a production `VITE_FIREBASE_PROJECT_ID`.

---

## 1. Firebase Console Project Creation Steps

1. Sign in to the [Firebase Console](https://console.firebase.google.com/) under the authorized engineering Google account.
2. Click **Add project** (or **Create a project**).
3. Enter the dedicated staging project name (see Section 2) and note the assigned immutable `<STAGING_PROJECT_ID>`.
4. Disable Google Analytics unless staging telemetry is explicitly requested (keeps staging footprint minimal and Spark-tier compatible).
5. Wait for project provisioning to complete, then open **Project Settings (gear icon) -> Your apps -> Add app -> Web (`</>`)** to register the staging Web App and obtain the **non-secret** Web SDK configuration values (Section 6).

## 2. Recommended Staging Project Naming

Use explicit environment suffixes so Staging cannot be confused with Production or local `demo-medicore`:
- **Recommended Display Name:** `MediCore Healthcare Staging`
- **Recommended Project ID Pattern:** `medicore-saas-staging-<org-or-env>` (e.g., `<STAGING_PROJECT_ID>`)
- **Automated App Guard:** `src/lib/firebaseEnv.ts` rejects `VITE_FIREBASE_PROJECT_ID="demo-medicore"` and project IDs containing `prod` / `production` when `VITE_MEDICORE_ENV="staging"`.

## 3. Authentication Configuration

1. In Firebase Console -> **Authentication -> Get started**.
2. Open **Sign-in method -> Email/Password**:
   - Enable **Email/Password**.
   - Leave passwordless email-link disabled unless explicitly added in a later phase.
3. Under **Authentication -> Settings -> Authorized domains**:
   - Verify `<STAGING_PROJECT_ID>.firebaseapp.com` and any staging preview origin (no unverified wildcard origins).
4. **Public Registration Notice:** `firestore.rules` permits self-creation of `/users/{uid}` ONLY as `'patient'` (within an existing active clinic) or `'clinic_owner'` atomically creating a new clinic via `onboardClinicTransaction`. Client-side creation of `'super_admin'` is unconditionally blocked by `firestore.rules` (`request.resource.data.get('role', '') != 'super_admin'`).

## 4. Firestore Database Initialization

1. In Firebase Console -> **Firestore Database -> Create database**.
2. Select **Start in production mode** (never test mode — `firestore.rules` starts with global deny `allow read, write: if false;` and deploys explicitly via CLI).
3. Choose the target region (e.g., `me-central2` / `europe-west1` / `us-central1` matching regional compliance requirements).
4. Keep the `(default)` database ID (`src/lib/firebase.ts` calls `getFirestore(app)` against `(default)`).

## 5. Required Firebase CLI Installation and Authentication

1. Verify Node.js (`>= 20`) and Firebase CLI (`firebase-tools`):
   ```bash
   npx firebase-tools --version
   # or install globally if preferred:
   npm install -g firebase-tools
   ```
2. Authenticate interactively (never store CI refresh tokens in the repo):
   ```bash
   firebase login
   ```
3. Confirm available projects and ensure `<STAGING_PROJECT_ID>` appears under your authorized account:
   ```bash
   firebase projects:list
   ```

## 6. Required Environment Variables (Exact Names)

Read by `src/lib/firebase.ts` and validated fail-closed by `src/lib/firebaseEnv.ts`:

| Exact Variable Name | Purpose | Staging Requirement |
|---|---|---|
| `VITE_MEDICORE_ENV` | Enforces MediCore deployment mode (`demo` \| `emulator` \| `staging`) | **Required:** `"staging"` |
| `VITE_USE_FIREBASE_EMULATOR` | Toggles local emulator host binding | **Required:** `"false"` |
| `VITE_FIREBASE_API_KEY` | Firebase Web API key from Staging Project Settings | **Required** (non-placeholder) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<STAGING_PROJECT_ID>.firebaseapp.com` | **Required** (valid domain) |
| `VITE_FIREBASE_PROJECT_ID` | Dedicated `<STAGING_PROJECT_ID>` | **Required** (cannot be `demo-medicore` or `*prod*`) |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<STAGING_PROJECT_ID>.firebasestorage.app` | **Recommended** |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID from Web App config | **Recommended** |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID (`1:...:web:...`) | **Required** (non-placeholder) |

## 7. Creating the Staging `.env.local` File

`.env*` (excluding `!.env.example`) is ignored by `.gitignore`. Copy `.env.example` to `.env.local` and populate ONLY your dedicated staging values:

```bash
cp .env.example .env.local
```

Template `.env.local` structure (no secrets committed):

```env
VITE_MEDICORE_ENV="staging"
VITE_USE_FIREBASE_EMULATOR="false"

VITE_FIREBASE_API_KEY="<STAGING_WEB_API_KEY>"
VITE_FIREBASE_AUTH_DOMAIN="<STAGING_PROJECT_ID>.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="<STAGING_PROJECT_ID>"
VITE_FIREBASE_STORAGE_BUCKET="<STAGING_PROJECT_ID>.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="<STAGING_SENDER_ID>"
VITE_FIREBASE_APP_ID="<STAGING_APP_ID>"
```

## 8. Verify Target Project Before Deployment

Before issuing any write/deploy command, explicitly confirm the active CLI target is `<STAGING_PROJECT_ID>` (and NOT production):

```bash
firebase use <STAGING_PROJECT_ID>
firebase target:apply || true
firebase projects:list
grep -E 'VITE_MEDICORE_ENV|VITE_FIREBASE_PROJECT_ID|VITE_USE_FIREBASE_EMULATOR' .env.local
```

Verify visually that:
1. Active alias (`*`) in `firebase projects:list` matches `<STAGING_PROJECT_ID>`.
2. `VITE_MEDICORE_ENV="staging"` and `VITE_USE_FIREBASE_EMULATOR="false"` in `.env.local`.
3. `VITE_FIREBASE_PROJECT_ID` matches `<STAGING_PROJECT_ID>` verbatim.

## 9. Safe Deployment Commands (Firestore Rules & Indexes Only)

> Do NOT run `firebase deploy` without `--only firestore:rules,firestore:indexes --project <STAGING_PROJECT_ID>`.

```bash
# 1. Re-run local emulator security & integration tests before pushing rules
firebase emulators:exec --only auth,firestore --project demo-medicore "npm run test:emulator && npm run test:e2e"

# 2. Validate build strictly under staging configuration
npx tsc --noEmit && npm run build

# 3. Deploy ONLY Firestore Rules and Composite Indexes to explicit Staging project
firebase deploy --only firestore:rules,firestore:indexes --project <STAGING_PROJECT_ID>
```

## 10. Index Build Verification

Verify all 5 composite indexes declared in `firestore.indexes.json` finish building (`Ready` / `READY`):

```bash
firebase firestore:indexes --project <STAGING_PROJECT_ID>
```

Expected index coverage:
1. `appointments` (`COLLECTION`): `doctorId ASC, date ASC, timeSlot ASC`
2. `appointments` (`COLLECTION`): `patientId ASC, date DESC`
3. `queues` (`COLLECTION`): `doctorId ASC, status ASC, createdAt ASC`
4. `invoices` (`COLLECTION`): `patientId ASC, date DESC`
5. `labResults` (`COLLECTION`): `patientId ASC, status ASC`

Wait until every index transitions from `CREATING` to `READY` before running appointment, queue, or billing smoke tests.

## 11. Staging User Provisioning Guidance (Synthetic Test Data Only)

> **No Unsafe Self-Registration for Privileged Roles:** `super_admin` cannot be created from any client form (`firestore.rules` L600). Staff roles (`doctor`, `nurse`, `receptionist`, `accountant`, `clinic_manager`) require tenant ownership or privileged Console/Admin provisioning.

Provision synthetic test users in **Firebase Console -> Authentication** + **Firestore Data**:
1. Create **non-PHI synthetic test accounts** (e.g., `staging-owner@synthetic.test`, `staging-doc@synthetic.test`, `staging-rec@synthetic.test`, `staging-acc@synthetic.test`, `staging-superadmin@synthetic.test`) in **Authentication -> Users -> Add user**, and record each generated `<UID>`.
2. Create an initial synthetic tenant `/clinics/clinic-staging-01` (`id: "clinic-staging-01"`, `status: "active"`, `ownerUid: "<OWNER_UID>"`, plus required metadata fields).
3. For each account, create `/users/<UID>` with matching `clinicId: "clinic-staging-01"`, canonical `role` (`clinic_owner`, `doctor`, `receptionist`, `accountant`, `nurse`, `clinic_manager`, or `super_admin`), and `status: "active"`.
4. Add matching `/clinics/clinic-staging-01/members/<UID>` documents for tenant staff.
5. Never reuse personal/real emails, real national IDs, or production patient phone numbers.

## 12. Staging Smoke-Test Checklist

Run the staging frontend locally (`npm run preview -- --port 4173`) or on staging Hosting connected to `<STAGING_PROJECT_ID>`, then verify:

- [ ] **Environment Lock:** Top `RoleBanner` shows `STAGING` badge and `Live Firebase Mode (Enforced)`; Demo toggle in `FirebaseModal` reads `Staging Locked` (`disabled`).
- [ ] **Misconfiguration Fail-Closed Check:** Temporarily verify (or inspect CI log) that missing staging keys surface an alert banner without loading mock Demo clinics.
- [ ] **Auth & Role Binding:** Sign in as `staging-rec` -> Role locks to `receptionist` and `clinic-staging-01`; `doctor-room` clinical PHI notes stay inaccessible (`PERMISSION_DENIED` if queried directly).
- [ ] **Appointment + Deterministic Slot Lock:** Book two appointments, reschedule one, cancel it, and check in the active appointment -> Queue ticket generated (`A-010+`).
- [ ] **Doctor Rx & Lab Orders:** Sign in as `staging-doc` -> Persist a Lab Order -> Sign & Finalize Consultation -> Reload browser -> Persisted Lab Order & finalized Rx survive from Staging Firestore.
- [ ] **Billing & Immutable Ledger:** Sign in as `staging-acc` -> Record payment on unpaid invoice -> Confirm invoice transitions to `paid` and `/payments/{paymentId}` ledger receipt appears and survives reload.
- [ ] **Sign-Out Cleanup:** Sign out -> Active role/clinic resets cleanly and subscribed collections clear immediately.

## 13. Rollback Procedure for Firestore Rules

If a staging rules release causes unintended denials or regression:
1. Check rule release history via CLI or Firebase Console -> **Firestore Database -> Rules -> History**:
   ```bash
   firebase firestore:rules:releases --project <STAGING_PROJECT_ID>
   ```
2. Roll back immediately in Firebase Console (**Rules -> Select previous timestamp -> Publish**) OR restore the previous verified `firestore.rules` commit locally and re-deploy explicitly to staging:
   ```bash
   firebase deploy --only firestore:rules --project <STAGING_PROJECT_ID>
   ```

## 14. Environment Cleanup & Test Data Management

- Clear synthetic staging test records after test cycles via Firebase Console (**Delete collection**) or a targeted staging-only script verified against `<STAGING_PROJECT_ID>`.
- Never expose long-lived service-account JSON keys on developer machines; delete temporary staging accounts once QA finishes.
- Ensure `.env.local`, `*.log`, `test-results/`, `playwright-report/`, `.firebase/`, and `dist/` remain untracked.

## 15. Production Separation Reminder

- Staging validation does **NOT** authorize Production release.
- Production deployment remains gated on:
  1. Separate owner-authorized Production Firebase project (`<PRODUCTION_PROJECT_ID>`).
  2. Server-side Cloud Functions (Blaze tier) for tariff/VAT calculation, sequential invoice numbering, Custom Claims synchronization, and verified payment gateway webhooks.
  3. Dedicated staging QA sign-off and security review.
