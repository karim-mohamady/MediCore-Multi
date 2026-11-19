# MediCore SaaS — Phase 9.9.1 Independent RBAC, Schema & Index Verification Matrix

**Verification Basis:** Direct inspection and automated execution against `/firestore.rules` (653 lines), `/src/lib/permissions.ts` (243 lines), `/src/lib/firestore.ts`, `/src/context/AppContext.tsx`, `/src/App.tsx`, `/firebase-blueprint.json`, `/firestore.indexes.json`, UI views/modals, and Firebase Local Emulators (`auth`, `firestore`).

---

## 1. Canonical 8-Role Capability & Firestore Rules Parity

Legacy alias normalization (`src/lib/permissions.ts`): `'admin'` -> `'clinic_manager'` (least privilege). Any non-canonical string throws `AuthorizationError` (`[RBAC_UNAUTHORIZED]`).

| Capability (`RolePermissionMatrix`) | `super_admin` | `clinic_owner` | `clinic_manager` | `doctor` | `receptionist` | `nurse` | `accountant` | `patient` | Verified Firestore Rules & Live App Parity |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`canAccessPHI`** | No | **Yes** | No | **Yes** | No | **Yes** | No | Own Only | `isClinicalStaff(clinicId)` (`doctor`, `nurse`, active `clinic_owner`); `patient` strictly scoped via `isPatientOwner` |
| **`canAccessOwnRecords`** | No | **Yes** | No | **Yes** | No | **Yes** | No | **Yes** | `isPatientOwner` checks `uid == patientId \|\| patient.userId == uid` + active clinic/user |
| **`canModifyClinicalRecords`** | No | No | No | **Yes** | No | No | No | No | `isDoctor(clinicId)` required for `consultations` & `prescriptions` create/update (when `status != 'finalized'`) |
| **`canEnrollPatients`** | No | **Yes** | **Yes** | No | **Yes** | **Yes** | No | No | `isReceptionistOrStaff(clinicId)` enforced on `patients` create/update & `AppContext.addPatient` |
| **`canManageBilling`** | No | **Yes** | **Yes** | No | No | No | **Yes** | No | `isAccountantOrAdmin(clinicId)` controls invoice updates & `/payments` ledger writes |
| **`canIssueInvoices`** | No | **Yes** | **Yes** | No | **Yes** | No | **Yes** | No | `isAccountantOrAdmin` OR `receptionist` on `invoices` create/read (`totalAmount > 0`, `paidAmount == 0`) |
| **`canCollectPayments`** | No | **Yes** | **Yes** | No | No | No | **Yes** | No | Bidirectional `lastPaymentId` + `existsAfter` / `getAfter` 1:1 batch coupling in `firestore.rules` |
| **`canManageQueue`** | No | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | No | No | Matches `queues` create (`isReceptionistOrStaff`) & update (`receptionist`, `nurse`, `clinic_manager`, `doctor`, `clinic_owner`) |
| **`canScheduleAppointments`** | No | **Yes** | **Yes** | **Yes** | **Yes** | No | No | Own Only | Matches `appointments` & `appointmentSlots` create/update rules (`patient` create/cancel/reschedule self-only) |
| **`canManageClinicSettings`** | **Yes** | **Yes** | No | No | No | No | No | No | `isSuperAdmin()` OR `isClinicOwner(clinicId)` (`ownerUid == request.auth.uid`) on `clinics`, `members`, `branches` |
| **`canReadAuditLogs`** | **Yes** | **Yes** | No | No | No | No | No | No | `isClinicOwner(clinicId) \|\| isSuperAdmin()` on `/clinics/{clinicId}/auditLogs`; immutable create-only (`update, delete: false`) |
| **`canManagePlatform`** | **Yes** | No | No | No | No | No | No | No | `isSuperAdmin()` governs global `/clinics` and `/users`; excluded from tenant PHI & invoices |

### Subtle Role Edge Cases Verified
- **`clinic_owner` ownership binding:** `isClinicOwner(clinicId)` in `firestore.rules` (L71–74) verifies both `role == 'clinic_owner'` AND `clinics/{clinicId}.data.ownerUid == request.auth.uid`.
- **`accountant` appointment boundary:** `appointments` update allows `accountant` strictly `['paymentStatus', 'notes', 'updatedAt']` (L372–376); `'status'` mutation is denied by rules & verified in Emulator tests.
- **`nurse` clinical boundary:** `nurse` reads `prescriptions` & `labResults`, updates `patientClinicalRecords` (vitals), and creates `pending`/`ordered` `labResults`, but is rejected from authoring `consultations`/`prescriptions` or approving `labResults` (verified in block **42**).
- **`receptionist` billing boundary:** `receptionist` can issue `unpaid` invoices (`payNow` locked off in `NewInvoiceModal.tsx`) but cannot collect payments or update invoices.
- **Unprovisioned / Suspended users & Inactive clinics:** `isActiveAccount()` and `isClinicActive()` fail closed when `/users/{uid}` is missing, `status != 'active'`, or clinic `status != 'active'` (verified in blocks **2, 13, 30, 41**).

---

## 2. Route & Navigation Parity (`VIEW_ALLOWED_ROLES` vs. Components)

Verified across `/src/lib/permissions.ts` (`VIEW_ALLOWED_ROLES`), `/src/App.tsx`, `/src/components/Sidebar.tsx`, `/src/components/Header.tsx`, and `/src/components/BottomNav.tsx`.

| View (`activeView`) | Default For | Allowed Roles | Gated UI Actions & Fail-Closed Behavior |
| :--- | :--- | :--- | :--- |
| `landing` | — | All 8 canonical roles | Redirects unauthorized sub-views safely via `getDefaultViewForRole()` |
| `dashboard` | Staff (`clinic_owner`..`accountant`) | All 7 non-patient roles | Quick buttons (`New Patient`, `Book Visit`, `Issue Invoice`, `Call Next`) independently gated by `hasRolePermission` |
| `queue` | — | `super_admin`, `clinic_owner`, `clinic_manager`, `doctor`, `receptionist`, `nurse` | `Call Next`, `Check-In`, `Enter Room`, `Finish Visit` gated by `canManageQueue`; `+ Intake` gated by `canScheduleAppointments` |
| `appointments` | — | `super_admin`, `clinic_owner`, `clinic_manager`, `doctor`, `receptionist` | `Book`, `Reschedule`, `Cancel` gated by `canScheduleAppointments`; `Check In Now` gated by `canManageQueue` |
| `patients` | — | `super_admin`, `clinic_owner`, `clinic_manager`, `doctor`, `receptionist`, `nurse` | `+ New Patient` gated by `canEnrollPatients` (`doctor` read-only) |
| `doctor-room` | — | `super_admin`, `clinic_owner`, `doctor`, `nurse` | `Sign & Finalize Consultation` restricted to `canModifyClinicalRecords` (`doctor`); `nurse`/`clinic_owner` see `Save Vital Signs` (`canAccessPHI`) |
| `billing` | — | `super_admin`, `clinic_owner`, `clinic_manager`, `accountant`, `receptionist` | `Issue Invoice` gated by `canIssueInvoices`; `Pay Balance` & `NewInvoiceModal` `#payNow` collection gated by `canCollectPayments` |
| `excel` | — | `super_admin`, `clinic_owner`, `clinic_manager`, `receptionist` | Bulk CSV validation, duplicate rejection & UTF-8 BOM export |
| `patient-portal` | `patient` | `super_admin`, `patient`, `clinic_owner` | Live mode removes `patients[0]` fallback; hides `draft` prescriptions & non-`approved` lab results |
| `super-admin` | `super_admin` | `super_admin` | In Live mode, subscribes solely to `/clinics` (plus `users`/`auditLogs` only when a real tenant clinic is selected) |

---

## 3. Authoritative Schema Parity: `firestore.rules` vs. `firebase-blueprint.json`

**Authoritative Source for Deployment:** `/firestore.rules` (`firebase.json` -> `"firestore.rules": "firestore.rules"`). `/firebase-blueprint.json` is preserved unchanged as a summary schema catalog of the 8 core transactional entities.

| Area | Present in `/firestore.rules` & Runtime App | Status in `/firebase-blueprint.json` | Impact / Notes |
| :--- | :--- | :--- | :--- |
| Core 8 Paths (`/users`, `/clinics`, `patients`, `appointmentSlots`, `appointments`, `queues`, `invoices`, `payments`) | Enforced in rules + `src/lib/firestore.ts` | Documented | Matches blueprint entities; `firestore.rules` adds strict field immutability & transition guards |
| Subcollections (`members`, `branches`, `patientClinicalRecords`, `consultations`, `prescriptions`, `labResults`, `auditLogs`) | Enforced with tenant, clinical PHI, and immutability rules | Omitted | Documented discrepancy only; **no** rules or blueprint files modified |
| Linking Fields (`Patient.userId`, `User.patientId`) | Used in `isPatientOwner()` & `linkPatientAccountToUser()` & `PatientPortalView.tsx` | Omitted | Fixed TypeScript parity in `src/types/index.ts` (`Patient.userId?: string`) |
| `AppointmentSlot.status` | Rules enforce `'reserved'` / `'cancelled'` (`予約` = `'reserved'`) | Enum lists `["reserved", "cancelled"]` | Aligned; client & rules use `'reserved'` / `'cancelled'` |
| Extended Invoice / Payment Fields (`subtotal`, `tax`, `discount`, `items`, `notes`, `cashierName`, `patientName`, `lastPaymentId`) | `lastPaymentId` bidirectional 1:1 batch-coupled; line items/totals immutable after create | Core subset documented (incl. `lastPaymentId`) | Safe; `firestore.rules` validates immutability on extended fields |

---

## 4. Composite Indexes (`firestore.indexes.json`) vs. Live Firestore Queries (`src/lib/firestore.ts`)

`firestore.indexes.json` declares **7** `COLLECTION`-scoped composite indexes (`fieldOverrides: []`).

| # | Collection Group | Index Fields | Used By Query in `src/lib/firestore.ts` | Classification |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `users` | `clinicId ASC`, `role ASC` | `subscribeClinicPractitioners()` (`where('clinicId', '==', clinicId), where('role', 'in', ['doctor', 'clinic_owner'])`) | **Actively Queried** |
| 2 | `labResults` | `patientId ASC`, `status ASC` | `subscribeClinicLabs(patientScopedId)` (`where('patientId', '==', patientScopedId), where('status', '==', 'approved')`) | **Actively Queried** |
| 3 | `prescriptions` | `patientId ASC`, `status ASC` | `subscribeClinicPrescriptions(patientScopedId)` (`where('patientId', '==', patientScopedId), where('status', '==', 'finalized')`) | **Actively Queried** |
| 4 | `appointments` | `doctorId ASC`, `date ASC`, `timeSlot ASC` | Not queried directly; slot conflicts enforced atomically via deterministic `/appointmentSlots/{slotKey}` reads | **Pre-Provisioned (Reserved)** |
| 5 | `appointments` | `patientId ASC`, `date DESC` | `subscribeClinicAppointments(patientScopedId)` currently queries `where('patientId', '==', patientScopedId)` without `orderBy('date', 'desc')` | **Pre-Provisioned (Reserved)** |
| 6 | `queues` | `doctorId ASC`, `status ASC`, `createdAt ASC` | `subscribeClinicQueue()` uses single-field `orderBy('createdAt', 'asc')` or `where('patientId', '==', ...)` with client-side doctor/status filtering | **Pre-Provisioned (Reserved)** |
| 7 | `invoices` | `patientId ASC`, `date DESC` | `subscribeClinicInvoices(patientScopedId)` currently queries `where('patientId', '==', patientScopedId)` without `orderBy('date', 'desc')` | **Pre-Provisioned (Reserved)** |
