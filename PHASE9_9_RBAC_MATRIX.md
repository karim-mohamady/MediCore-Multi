# MediCore SaaS — Phase 9.9 Authoritative RBAC & Route Matrix

**Audit Basis:** Direct inspection and verification of `/firestore.rules`, `/src/lib/permissions.ts`, `/src/context/AppContext.tsx`, `/src/App.tsx`, navigation components (`Header.tsx`, `Sidebar.tsx`, `BottomNav.tsx`), views, modals, and Firestore Security Rules Emulator tests.

---

## 1. Canonical 8-Role Model (`src/lib/permissions.ts` & `firestore.rules`)

Legacy role aliases: `'admin'` normalizes strictly downward to `'clinic_manager'` (least privilege). Unrecognized roles (e.g., `'pharmacist'`, `'guest'`, `'owner'`, `''`) throw `AuthorizationError` (`[RBAC_UNAUTHORIZED]`).

| Capability (`RolePermissionMatrix`) | `super_admin` | `clinic_owner` | `clinic_manager` | `doctor` | `receptionist` | `nurse` | `accountant` | `patient` | Firestore Rules Parity |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`canAccessPHI`** | No | **Yes** | No | **Yes** | No | **Yes** | No | Own Only | `isClinicalStaff(clinicId)` (`doctor`, `nurse`, `clinic_owner`) |
| **`canAccessOwnRecords`** | No | **Yes** | No | **Yes** | No | **Yes** | No | **Yes** | `isPatientOwner(clinicId, patientId)` |
| **`canModifyClinicalRecords`** | No | No | No | **Yes** | No | No | No | No | `isDoctor(clinicId)` (`consultations`, `prescriptions`) |
| **`canEnrollPatients`** | No | **Yes** | **Yes** | No | **Yes** | **Yes** | No | No | `isReceptionistOrStaff(clinicId)` (`patients` create/update) |
| **`canManageBilling`** | No | **Yes** | **Yes** | No | No | No | **Yes** | No | `isAccountantOrAdmin(clinicId)` |
| **`canIssueInvoices`** | No | **Yes** | **Yes** | No | **Yes** | No | **Yes** | No | `isAccountantOrAdmin` OR `receptionist` (`invoices` create/read) |
| **`canCollectPayments`** | No | **Yes** | **Yes** | No | No | No | **Yes** | No | `isAccountantOrAdmin` (`invoices` update + `/payments` create) |
| **`canManageQueue`** | No | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | No | No | `receptionist`, `nurse`, `clinic_manager`, `doctor`, `clinic_owner` |
| **`canScheduleAppointments`** | No | **Yes** | **Yes** | **Yes** | **Yes** | No | No | Own Only | `appointments` create/update rules |
| **`canManageClinicSettings`** | **Yes** | **Yes** | No | No | No | No | No | No | `isSuperAdmin()` OR `isClinicOwner(clinicId)` |
| **`canReadAuditLogs`** | **Yes** | **Yes** | No | No | No | No | No | No | `isClinicOwner(clinicId)` OR `isSuperAdmin()` |
| **`canManagePlatform`** | **Yes** | No | No | No | No | No | No | No | `isSuperAdmin()` |

---

## 2. Protected Route Matrix (`VIEW_ALLOWED_ROLES` & `canAccessView()`)

Enforced identically across `Sidebar.tsx`, `Header.tsx`, `BottomNav.tsx`, and `App.tsx` (with automatic role-change redirect & `getDefaultViewForRole()` fail-closed fallback).

| Route (`activeView`) | Default Role(s) | Allowed Roles | Denied Roles |
| :--- | :--- | :--- | :--- |
| **`landing`** | — | All 8 canonical roles | Unauthenticated invalid roles |
| **`dashboard`** | `clinic_owner`, `clinic_manager`, `doctor`, `receptionist`, `nurse`, `accountant` | `super_admin`, `clinic_owner`, `clinic_manager`, `doctor`, `receptionist`, `nurse`, `accountant` | `patient` |
| **`queue`** | — | `super_admin`, `clinic_owner`, `clinic_manager`, `doctor`, `receptionist`, `nurse` | `accountant`, `patient` |
| **`appointments`** | — | `super_admin`, `clinic_owner`, `clinic_manager`, `doctor`, `receptionist` | `nurse`, `accountant`, `patient` |
| **`patients`** | — | `super_admin`, `clinic_owner`, `clinic_manager`, `doctor`, `receptionist`, `nurse` | `accountant`, `patient` |
| **`doctor-room`** | — | `super_admin`, `clinic_owner`, `doctor`, `nurse` *(vitals/lab read; Rx/consult write strictly `doctor`)* | `clinic_manager`, `receptionist`, `accountant`, `patient` |
| **`billing`** | — | `super_admin`, `clinic_owner`, `clinic_manager`, `accountant`, `receptionist` *(issue/read only; no payment collection)* | `doctor`, `nurse`, `patient` |
| **`excel`** | — | `super_admin`, `clinic_owner`, `clinic_manager`, `receptionist` | `doctor`, `nurse`, `accountant`, `patient` |
| **`patient-portal`** | `patient` | `super_admin`, `patient`, `clinic_owner` | `clinic_manager`, `doctor`, `receptionist`, `nurse`, `accountant` |
| **`super-admin`** | `super_admin` | `super_admin` | All 7 tenant roles |

---

## 3. Firestore Collection-Level Access Matrix (`firestore.rules`)

| Collection / Path | Read | Create | Update | Delete |
| :--- | :--- | :--- | :--- | :--- |
| **`/clinics/{clinicId}`** | Signed-in (`clinicId` match or `super_admin` or `active`) | `super_admin` OR onboarding owner (`ownerUid == uid`) | `super_admin` OR `clinic_owner` (locked immutable `ownerUid`/`id`) | `false` |
| **`/clinics/{clinicId}/members/{uid}`** | Same-tenant active staff (`isAnyTenantStaff`), `super_admin`, or self | `super_admin` OR initial clinic owner | `clinic_owner` (strict field whitelist, cannot self-modify) or `super_admin` | `false` |
| **`/clinics/{clinicId}/patients/{patientId}`** | `isAnyTenantStaff` OR `isPatientOwner` | `isReceptionistOrStaff` (`clinic_owner`, `clinic_manager`, `receptionist`, `nurse`) | `isReceptionistOrStaff` (immutable `userId` once set, non-negative `balance`) | `false` |
| **`/clinics/{clinicId}/patientClinicalRecords/{patientId}`** | `isClinicalStaff` (`doctor`, `nurse`, `clinic_owner`) OR `isPatientOwner` | `isClinicalStaff` (valid clinic patient) | `isClinicalStaff` (immutable `patientId`) | `false` |
| **`/clinics/{clinicId}/appointments/{aptId}`** | `isAnyTenantStaff` OR `isPatientOwner` | `isReceptionistOrStaff` OR `doctor` OR `isPatientOwner` (for self + active clinic) | `isReceptionistOrStaff` / `doctor` (`doctorId == uid`) / `accountant` *(strict `paymentStatus`, `notes`, `updatedAt` only)* / `isPatientOwner` *(cancel/reschedule only)* | `false` |
| **`/clinics/{clinicId}/appointmentSlots/{slotKey}`** | `isAnyTenantStaff` | `isReceptionistOrStaff` OR `doctor` OR `isPatientOwner` (validates `clinicId`, `doctorId`, `patientId`, `status == 'booked'`, deterministic key) | `isReceptionistOrStaff` OR `doctor` (`doctorId == uid`) OR `isPatientOwner` (cancelled transition) | Same roles (for deterministic reschedule swap) |
| **`/clinics/{clinicId}/queues/{queueId}`** | `isAnyTenantStaff` OR `isPatientOwner` | `isReceptionistOrStaff` | `receptionist`, `nurse`, `clinic_manager`, `doctor`, `clinic_owner` (valid forward state transitions) | `clinic_manager`, `clinic_owner` |
| **`/clinics/{clinicId}/consultations/{id}`** | `doctor`, `clinic_owner`, OR `isPatientOwner` *(only `status == 'finalized'`)* | `doctor` (`doctorId == uid`, valid patient) | `doctor` (`doctorId == uid`, non-finalized `status != 'finalized'`) | `false` |
| **`/clinics/{clinicId}/prescriptions/{id}`** | `doctor`, `nurse`, `clinic_owner`, OR `isPatientOwner` *(only `status == 'finalized'` — Phase 9.9 hardened)* | `doctor` (`doctorId == uid`, valid patient) | `doctor` (`doctorId == uid`, non-finalized `status != 'finalized'`) | `false` |
| **`/clinics/{clinicId}/labResults/{id}`** | `isClinicalStaff` OR `isPatientOwner` *(only `status == 'approved'`)* | `isClinicalStaff` (`pending` / `ordered`) | `doctor` / `clinic_owner` (`status != 'approved'`) | `false` |
| **`/clinics/{clinicId}/invoices/{invoiceId}`** | `isAccountantOrAdmin`, `receptionist`, OR `isPatientOwner` | `isAccountantOrAdmin` OR `receptionist` (`totalAmount > 0`, `paidAmount == 0`, `remainingAmount == totalAmount` if set) | `isAccountantOrAdmin` *(strict whitelist incl. `lastPaymentId`; immutable line items/tax/discount/total; non-decreasing bounded `paidAmount`)* | `false` |
| **`/clinics/{clinicId}/invoices/{invoiceId}/payments/{paymentId}`** | `isAccountantOrAdmin`, `receptionist`, OR invoice patient owner | `isAccountantOrAdmin` (`!exists` same ID, `amount > 0`, valid method, atomic `getAfter()` invoice balance & `lastPaymentId == paymentId` 1:1 batch coupling) | `false` (immutable ledger) | `false` |
| **`/clinics/{clinicId}/auditLogs/{logId}`** | `clinic_owner` OR `super_admin` | `isAnyTenantStaff` (`actorUid == uid`) | `false` (immutable ledger) | `false` |
| **`/users/{userId}`** | `super_admin`, self `uid`, `isAnyTenantStaff(clinicId)`, OR same-clinic active `patient` reading practitioner (`doctor` / `clinic_owner`) ONLY *(Phase 9.9 hardened)* | `super_admin` OR self-signup (`patient` / initial `clinic_owner` with `getAfter` clinic ownership; cannot self-assign `super_admin`) | `super_admin` OR self-profile display fields only (cannot alter `role`, `clinicId`, `status`, `patientId`) | `false` |
