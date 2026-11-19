# MediCore SaaS — Phase 9.9 Independent Security Findings & Remediation Register

**Audit Scope:** Independent adversarial verification of Phase 9.8 baselines, `/firestore.rules`, `/src/lib/firestore.ts`, `/src/lib/permissions.ts`, `/src/context/AppContext.tsx`, `/src/lib/firebaseEnv.ts`, `/scripts/verify-staging-ready.mjs`, UI views/modals, and emulator/Playwright suites.

---

## 1. Confirmed Findings Fixed in Phase 9.9

### SEC-01 (HIGH) — Same-Batch Multi-Payment Invoice Ledger Desynchronization
- **Discovery:** In `firestore.rules`, `invoices/{invoiceId}/payments/{paymentId}` `allow create` checked `getAfter(/invoices/{invoiceId}).data.paidAmount == get(/invoices/{invoiceId}).data.paidAmount + request.resource.data.amount`. An authorized accountant/admin could submit TWO equal `/payments/{p1}` and `/payments/{p2}` documents alongside ONE invoice `paidAmount` increment in a single Firestore write batch; both `create` rules would evaluate `getAfter()` identically and pass, creating duplicate ledger entries (`sum(payments) > invoice.paidAmount`) and over-crediting collected totals.
- **Remediation:**
  1. Added `lastPaymentId` to `invoices/{invoiceId}` update field whitelist in `firestore.rules` and required `'lastPaymentId' in request.resource.data && isValidId(request.resource.data.lastPaymentId)` whenever `paidAmount` increases.
  2. Added 1:1 batch coupling assertion in `payments/{paymentId}` `allow create`:
     `getAfter(/databases/$(database)/documents/clinics/$(clinicId)/invoices/$(invoiceId)).data.get('lastPaymentId', '') == paymentId`.
  3. Updated `recordPaymentTransaction()` in `src/lib/firestore.ts` and `Invoice.properties` in `firebase-blueprint.json` to include `lastPaymentId: paymentId`.
- **Verification:** Adversarial regression block **#35** in `src/tests/firestore.rules.test.ts` confirms a 2-payment batch against 1 invoice increment is now rejected by Firestore Security Rules, while single-payment `getAfter()` atomic batches succeed.

---

### SEC-02 (HIGH) — `/users/{userId}` Cross-Patient & Support-Staff PII Exposure
- **Discovery:** Previously, `match /users/{userId}` allowed any same-clinic signed-in user (including a `patient`) to read ANY `/users/{uid}` document inside the same `clinicId`, exposing other patients' and administrative/accounting staff emails, phone numbers, and roles.
- **Remediation:**
  1. Hardened `match /users/{userId}` `allow read` in `firestore.rules`: same-clinic patients can read ONLY own `/users/{uid}` OR practitioner profiles where `resource.data.get('role', '') in ['doctor', 'clinic_owner']`. Full clinic directory reads require `isAnyTenantStaff(clinicId)` or `isSuperAdmin()`.
  2. Added `subscribeClinicPractitioners(clinicId, ...)` in `src/lib/firestore.ts` (`where('clinicId', '==', clinicId), where('role', 'in', ['doctor', 'clinic_owner'])`) and routed `patient` role subscriptions in `src/context/AppContext.tsx` to use it instead of `subscribeClinicUsers()`.
  3. Added composite index `(clinicId ASC, role ASC)` on `users` in `firestore.indexes.json`.
- **Verification:** Adversarial regression block **#36** in `src/tests/firestore.rules.test.ts` confirms patient read of own `/users` doc & clinic doctor/owner docs succeeds, while patient reads of another patient, receptionist, or accountant fail (`PERMISSION_DENIED`).

---

### SEC-03 (HIGH) — Patient Read Exposure of Draft Prescriptions & Unapproved Lab Results
- **Discovery:**
  1. `firestore.rules` previously allowed `isPatientOwner(clinicId, resource.data.patientId)` to read ANY `/prescriptions/{id}` document including unfinalized `'draft'` prescriptions.
  2. `AppContext.tsx` / `subscribeClinicPrescriptions()` subscribed to all patient prescriptions without status filtering, and `PatientPortalView.tsx` previously fell back to `patients[0]` even in Live mode if a user had no linked patient doc, while rendering unapproved labs.
- **Remediation:**
  1. Restricted `prescriptions/{prescriptionId}` `allow read` in `firestore.rules` for patients strictly to `(isPatientOwner(clinicId, resource.data.get('patientId', '')) && resource.data.get('status', '') == 'finalized')`.
  2. Scoped `subscribeClinicPrescriptions()` in `src/lib/firestore.ts` with `where('status', '==', 'finalized')` when `patientScopedId` is set, and added `(patientId ASC, status ASC)` index on `prescriptions` in `firestore.indexes.json`.
  3. Updated `PatientPortalView.tsx` to remove `patients[0]` fallback when `!isDemoMode`, hide `'draft'` prescriptions (`rx.status !== 'draft'`), and gate Live labs to `l.status === 'approved'`.
- **Verification:** Regression block **#37–39** in `src/tests/firestore.rules.test.ts` confirms patient read of `'draft'` Rx is denied while `'finalized'` Rx is allowed.

---

### SEC-04 (MEDIUM) — Accountant Appointment Status Overwrite & Invoice Zero/Mismatch Integrity Gaps
- **Discovery:**
  1. `firestore.rules` previously included `'status'` in accountant's `appointments` `affectedKeys().hasOnly(...)`, letting an `accountant` alter clinical appointment lifecycle states (e.g., `'cancelled'`, `'completed'`).
  2. `invoices/{invoiceId}` `allow create` permitted `totalAmount >= 0` (zero-amount invoices) and omitted validation of initial `remainingAmount == totalAmount`.
- **Remediation:**
  1. Removed `'status'` from accountant's allowed update keys on `appointments/{appointmentId}` (now strictly `['paymentStatus', 'notes', 'updatedAt']`).
  2. Enforced `request.resource.data.totalAmount > 0` and `(!('remainingAmount' in request.resource.data) || request.resource.data.remainingAmount == request.resource.data.totalAmount)` on `invoices` `allow create`.
- **Verification:** Regression block **#37–39** in `src/tests/firestore.rules.test.ts` verifies accountant appointment `status` overwrite fails (`paymentStatus` + `notes` succeeds), zero-amount invoice creation fails, and mismatched `remainingAmount` fails.

---

### SEC-05 (MEDIUM) — UI/Context/Pre-Deploy Guard Consistency Gaps
1. **UI vs. Context & Rules RBAC Alignment:**
   - Added `canEnrollPatients` to `src/lib/permissions.ts` (`clinic_owner`, `clinic_manager`, `receptionist`, `nurse` only) matching `isReceptionistOrStaff`; enforced in `AppContext.addPatient`, `DashboardView`, `PatientsView`.
   - Gated UI action buttons to match `firestore.rules` across `Header.tsx` (`Onboard Clinic`), `BillingLedgerView.tsx` (`btnIssueInvoice`, `Pay Balance`), `AppointmentsView.tsx` (`Book`, `Reschedule`, `Cancel`, `Check In Now`), `QueueView.tsx` (`Call Next`, `Check-In`, `Enter Room`, `Finish Visit`, `Intake`), and `DoctorWorkspaceView.tsx` (`Sign & Finalize Consultation` restricted to `doctor`; `Save Vital Signs` separated for non-doctor clinical staff).
   - Hardened `NewInvoiceModal.tsx` & `AppContext.createInvoice`: `payNow` defaults to `hasRolePermission(currentRole, 'canCollectPayments')`, blocked from toggling on for `receptionist` (preserving `#payNow` element interaction for E2E parity), and `createInvoice` enforces `checkRolePermission(..., 'canCollectPayments')` before `createInvoiceRecord` when initial payment > 0.
2. **AppContext Mode Reset & `super_admin` Live Subscription Hardening:**
   - `setIsDemoMode(false)` resets `authProfile`, `currentRole`, and `currentClinicId` cleanly to fail-closed unprivileged defaults (`'patient'` / `'unassigned'`).
   - Added dedicated `super_admin` branch in Live subscription `useEffect` subscribing only to `subscribeAllClinics` (plus `users`/`auditLogs` only for real non-`'platform'`/`'unassigned'` clinic IDs) so `super_admin` never subscribes to tenant PHI/billing collections (`PERMISSION_DENIED`).
   - Initialized `App.tsx` `activeView` from `getDefaultViewForRole(currentRole)` and added optional `userId?: string` on `Patient` in `src/types/index.ts`.
3. **Staging Pre-Deploy Safety Guard (`scripts/verify-staging-ready.mjs`):**
   - Rejected unknown CLI flags, unexpected positionals, and dangling/flag-like values for `--project`.
   - Validated `--project` against `demo-medicore` and production naming even when `.env.local` is missing.
   - Blocked active `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, and `VITE_USE_FIREBASE_EMULATOR` in both `process.env` and `.env.local`.
   - Enforced valid hostname format on `VITE_FIREBASE_AUTH_DOMAIN`.
   - Verified in new unit tests **E13** and **E14** (`src/tests/firebase-env.test.ts`) and **R13** (`src/tests/emulator-rules.test.ts`).

---

## 2. Residual Accepted Pre-Staging Limitations (Spark-Tier Scope)

1. **Client-Calculated Invoice Totals & Display Sequencing:** `NewInvoiceModal.tsx` computes 15% VAT/subtotal client-side and `AppContext.tsx` formats display invoice numbers (`INV-2026-XXXX`). Server-side authoritative tariff pricing, VAT rules, refunds, and atomic invoice counters require **Firebase Blaze / Cloud Functions (Phase 10)**.
2. **Firebase Staging Project Provisioning Pending Owner Action:** No Staging `.env.local`, `.firebaserc`, or authenticated Firebase CLI session exists locally; Staging deployment and live Google Cloud Firestore/Auth execution remain blocked pending Owner Checklist completion (`STAGING_OWNER_CHECKLIST.md`).
