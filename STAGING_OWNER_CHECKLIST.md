# MediCore — Staging Owner Action Checklist

> **Security Rule:** Do NOT put real patient PHI, real patient emails, real phone numbers, real passwords, API keys, service-account JSON credentials, or private keys in this document or commit them to version control.

---

## 1. Staging Project Separation Rules

Before activating Firebase Staging:
- Use a **dedicated Firebase Staging project** (example naming: `medicore-clinic-staging`).
- **NEVER** deploy Staging onto a production Firebase project (project IDs matching `prod` or `production` are explicitly rejected by `src/lib/firebaseEnv.ts` and `scripts/verify-staging-ready.mjs`).
- **NEVER** point Staging at `demo-medicore` or enable `VITE_USE_FIREBASE_EMULATOR="true"`.

---

## 2. Owner Actions in Firebase Console (External Console Setup)

Complete these steps inside [Firebase Console](https://console.firebase.google.com/) under your dedicated Staging project:

1. **Create Dedicated Staging Project**
   - Click **Add project** -> name it cleanly with `-staging` (e.g., `medicore-clinic-staging`).
   - Disable or isolate Google Analytics as appropriate for internal clinic staging.
2. **Register a Web App**
   - In **Project Settings -> General -> Your apps -> Add app -> Web (`</>`)**, register a Staging web app (e.g., `medicore-web-staging`).
   - Copy the generated public Firebase Web SDK configuration fields (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
   - **Never** generate or download an Admin SDK Service Account private key into the frontend repo.
3. **Provision Cloud Firestore**
   - Open **Build -> Firestore Database -> Create database**.
   - Select your target staging region (e.g., `me-central1` or `europe-west1`).
   - Start in **Production mode** (default-deny until `firestore.rules` is deployed in Section 4).
4. **Enable Firebase Authentication**
   - Open **Build -> Authentication -> Get started -> Sign-in method**.
   - Enable **Email/Password**.
   - Configure **Settings -> Authorized domains**:
     - Keep `localhost` (local staging verification only) and add your exact staging Hosting domain (`<STAGING_PROJECT_ID>.web.app`, `<STAGING_PROJECT_ID>.firebaseapp.com`).
5. **Budget & Quotas (Recommended Staging Safeguard)**
   - Set a low monthly billing budget alert in Google Cloud Console on the Staging project so runaway loops or automated tests trigger alerts immediately.

---

## 3. Local Staging Environment Setup (`.env.local`)

Copy `.env.example` to `.env.local` locally (ignored by `.gitignore` — **never commit `.env.local`**) and populate placeholders with your real Staging Web App SDK values:

```env
VITE_MEDICORE_ENV="staging"
VITE_USE_FIREBASE_EMULATOR="false"

VITE_FIREBASE_API_KEY="<STAGING_FIREBASE_API_KEY>"
VITE_FIREBASE_AUTH_DOMAIN="<STAGING_PROJECT_ID>.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="<STAGING_PROJECT_ID>"
VITE_FIREBASE_STORAGE_BUCKET="<STAGING_PROJECT_ID>.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="<STAGING_MESSAGING_SENDER_ID>"
VITE_FIREBASE_APP_ID="<STAGING_FIREBASE_APP_ID>"
```

Run the local pre-deployment safety check (fails closed until all checks pass):

```bash
npm run staging:check -- --project <STAGING_PROJECT_ID>
```

---

## 4. Authorized Owner Firebase CLI Commands

> **Warning — Remote Cloud Operations:** The commands below authenticate against your Google account and modify the remote `<STAGING_PROJECT_ID>` Firestore project. Verify `--project <STAGING_PROJECT_ID>` before executing every command.

1. **Authenticate Firebase CLI:**
   ```bash
   npx firebase login
   ```
2. **Verify Available Projects (Read-Only):**
   ```bash
   npx firebase projects:list
   ```
3. **Select Staging Project Explicitly (Optional `.firebaserc` alias):**
   ```bash
   npx firebase use --add <STAGING_PROJECT_ID>
   ```
   *(Assign alias `staging`, never `prod`.)*
4. **Run MediCore Pre-Deployment Safety Guard + Production Build:**
   ```bash
   npm run build
   npm run staging:deploy -- --project <STAGING_PROJECT_ID>
   ```
5. **Deploy Security Rules & Composite Indexes ONLY (Remote Write):**
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes --project <STAGING_PROJECT_ID>
   ```
6. *(Optional)* **Deploy Frontend Hosting (Remote Write):**
   - Only if you choose to add a `"hosting"` block to `firebase.json` pointing to `"public": "dist"`:
   ```bash
   npx firebase deploy --only hosting --project <STAGING_PROJECT_ID>
   ```

---

## 5. Synthetic Non-PHI Staging Validation Dataset

Seed **non-PHI synthetic records** only in Staging (`/clinics/clinic-nokhba-staging` + `/users/{uid}`).

### Canonical 8-Role Test Matrix (Create Accounts in Firebase Auth UI, Assign Strong Unique Passwords Manually)

| Role (`users/{uid}.role`) | Synthetic Email Placeholder | `clinicId` | Expected Access Boundary |
| :--- | :--- | :--- | :--- |
| `super_admin` | `super.admin@staging.medicore.invalid` | `platform` | Platform console & `auditLogs` read; **blocked** from clinical PHI & invoices |
| `clinic_owner` | `owner.a@staging.medicore.invalid` | `clinic-nokhba-staging` | Full tenant ops, `auditLogs`, billing, clinic PHI |
| `clinic_manager` | `manager.a@staging.medicore.invalid` | `clinic-nokhba-staging` | Appointments, queue, billing, patients; **blocked** from clinical PHI & `auditLogs` |
| `doctor` | `doctor.a@staging.medicore.invalid` | `clinic-nokhba-staging` | Own consultations/Rx authorship & finalization, clinical PHI; **blocked** from billing mutations |
| `nurse` | `nurse.a@staging.medicore.invalid` | `clinic-nokhba-staging` | Vitals (`patientClinicalRecords`), queue, lab order creation; **blocked** from authoring Rx/consultations or billing |
| `receptionist` | `reception.a@staging.medicore.invalid` | `clinic-nokhba-staging` | Patients, appointments, slots, queue check-in, issue invoices; **blocked** from clinical PHI & payments |
| `accountant` | `accountant.a@staging.medicore.invalid` | `clinic-nokhba-staging` | Atomic batch invoice payment collection & billing ledger; **blocked** from clinical PHI & `doctor-room` |
| `patient` | `patient.a1@staging.medicore.invalid` | `clinic-nokhba-staging` | Self-scoped `patient-portal`, own approved labs & finalized consultations only |

### Minimum Seed Documents Required in Firestore Staging

1. `/clinics/clinic-nokhba-staging`:
   `{ id: "clinic-nokhba-staging", name: "Nokhba Staging Medical", code: "STG", ownerUid: "<OWNER_AUTH_UID>", status: "active" }`
2. `/users/<UID>` for each synthetic test account above (`id`, `clinicId`, `role`, `status: "active"`, plus `patientId: "pat-stg-01"` on the patient user document).
3. `/clinics/clinic-nokhba-staging/patients/pat-stg-01`:
   `{ id: "pat-stg-01", clinicId: "clinic-nokhba-staging", userId: "<PATIENT_AUTH_UID>", name: "Synthetic Patient One" }`

> **Cross-Tenant Isolation Verification:** Seed a second synthetic clinic `/clinics/clinic-amal-staging` (`status: "active"`) and confirm every Clinic A role receives `PERMISSION_DENIED` when attempting reads or writes against Clinic B documents.
