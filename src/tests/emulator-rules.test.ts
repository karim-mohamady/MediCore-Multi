import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CANONICAL_ROLES, UserRole } from '../types';
import {
  ROLE_PERMISSIONS,
  LEGACY_ROLE_MAP,
  normalizeRole,
  checkRolePermission,
  canAccessView,
  getDefaultViewForRole,
  AuthorizationError,
} from '../lib/permissions';

/**
 * MediCore Phase 9 — Canonical RBAC Matrix & Legacy Role Normalization Audit Tests
 *
 * Historical Reconciliation Note:
 * Phase 8 claimed "130 Verified Scenarios" via a static arithmetic inventory file while only executing
 * 35 Node JS unit tests and 0 live Firestore Emulator tests.
 * In Phase 9, documented checklists are NOT counted as executed tests.
 * Actual Firestore Security Rules execution against /firestore.rules runs in:
 *   src/tests/firestore.rules.test.ts (via `firebase emulators:exec --only auth,firestore`).
 */
describe('MediCore Canonical 8-Role RBAC Matrix & Legacy Handling', () => {
  it('R1: Enforces exactly 8 canonical roles in CANONICAL_ROLES and ROLE_PERMISSIONS', () => {
    assert.strictEqual(CANONICAL_ROLES.length, 8);
    assert.deepStrictEqual([...CANONICAL_ROLES], [
      'super_admin',
      'clinic_owner',
      'clinic_manager',
      'doctor',
      'receptionist',
      'nurse',
      'accountant',
      'patient',
    ]);

    for (const role of CANONICAL_ROLES) {
      assert.ok(ROLE_PERMISSIONS[role], `Missing ROLE_PERMISSIONS entry for canonical role '${role}'`);
    }
  });

  it('R2: Legacy admin maps down to clinic_manager (least privilege), never clinic_owner/super_admin', () => {
    assert.strictEqual(LEGACY_ROLE_MAP['admin'], 'clinic_manager');
    assert.strictEqual(normalizeRole('admin'), 'clinic_manager');
  });

  it('R3: Unsupported or unknown roles (including pharmacist, guest, empty) are explicitly rejected', () => {
    for (const invalidRole of ['pharmacist', 'guest', 'root', 'owner', '', null, undefined]) {
      assert.throws(
        () => normalizeRole(invalidRole),
        (err: unknown) => err instanceof AuthorizationError
      );
    }
  });

  it('R4: clinic_manager is excluded from unrestricted PHI and audit logs (aligned with firestore.rules)', () => {
    assert.strictEqual(ROLE_PERMISSIONS.clinic_manager.canAccessPHI, false);
    assert.strictEqual(ROLE_PERMISSIONS.clinic_manager.canModifyClinicalRecords, false);
    assert.strictEqual(ROLE_PERMISSIONS.clinic_manager.canReadAuditLogs, false);
    assert.throws(
      () => checkRolePermission('clinic_manager', 'canAccessPHI'),
      (err: unknown) => err instanceof AuthorizationError
    );
  });

  it('R5: receptionist can issue invoices and manage queue/appointments but cannot access PHI or collect payments', () => {
    assert.strictEqual(ROLE_PERMISSIONS.receptionist.canAccessPHI, false);
    assert.strictEqual(ROLE_PERMISSIONS.receptionist.canIssueInvoices, true);
    assert.strictEqual(ROLE_PERMISSIONS.receptionist.canCollectPayments, false);
    assert.strictEqual(ROLE_PERMISSIONS.receptionist.canManageQueue, true);
    assert.strictEqual(ROLE_PERMISSIONS.receptionist.canScheduleAppointments, true);

    assert.throws(
      () => checkRolePermission('receptionist', 'canCollectPayments'),
      (err: unknown) => err instanceof AuthorizationError
    );
  });

  it('R6: nurse can access clinical PHI vitals/Rx and queue, but cannot modify consultations/Rx', () => {
    assert.strictEqual(ROLE_PERMISSIONS.nurse.canAccessPHI, true);
    assert.strictEqual(ROLE_PERMISSIONS.nurse.canModifyClinicalRecords, false);
    assert.strictEqual(ROLE_PERMISSIONS.nurse.canManageQueue, true);
    assert.strictEqual(ROLE_PERMISSIONS.nurse.canManageBilling, false);
  });

  it('R7: accountant can collect payments & manage billing, but cannot access PHI or modify clinical records', () => {
    assert.strictEqual(ROLE_PERMISSIONS.accountant.canManageBilling, true);
    assert.strictEqual(ROLE_PERMISSIONS.accountant.canCollectPayments, true);
    assert.strictEqual(ROLE_PERMISSIONS.accountant.canAccessPHI, false);
    assert.strictEqual(ROLE_PERMISSIONS.accountant.canModifyClinicalRecords, false);
  });

  it('R8: clinic_owner holds full tenant management + auditLogs + PHI read without doctor Rx authorship', () => {
    const ownerPerms = ROLE_PERMISSIONS.clinic_owner;
    assert.strictEqual(ownerPerms.canAccessPHI, true);
    assert.strictEqual(ownerPerms.canReadAuditLogs, true);
    assert.strictEqual(ownerPerms.canManageClinicSettings, true);
    assert.strictEqual(ownerPerms.canCollectPayments, true);
    assert.strictEqual(ownerPerms.canModifyClinicalRecords, false);
  });

  it('R9: patient holds strict self-scoped permissions only', () => {
    const patientPerms = ROLE_PERMISSIONS.patient;
    assert.strictEqual(patientPerms.canAccessOwnRecords, true);
    assert.strictEqual(patientPerms.canScheduleAppointments, true);
    assert.strictEqual(patientPerms.canAccessPHI, false);
    assert.strictEqual(patientPerms.canManageBilling, false);
    assert.strictEqual(patientPerms.canManageQueue, false);
    assert.strictEqual(patientPerms.canReadAuditLogs, false);
  });

  it('R10: All canonical roles validate cleanly through normalizeRole()', () => {
    CANONICAL_ROLES.forEach((role: UserRole) => {
      assert.strictEqual(normalizeRole(role), role);
    });
  });

  it('R11: Protected UI routes enforce role separation across doctor-room, billing, excel, patient-portal, and super-admin', () => {
    assert.strictEqual(canAccessView('patient', 'patient-portal'), true);
    assert.strictEqual(canAccessView('patient', 'doctor-room'), false);
    assert.strictEqual(canAccessView('patient', 'billing'), false);
    assert.strictEqual(canAccessView('receptionist', 'doctor-room'), false);
    assert.strictEqual(canAccessView('receptionist', 'appointments'), true);
    assert.strictEqual(canAccessView('receptionist', 'billing'), true);
    assert.strictEqual(canAccessView('accountant', 'billing'), true);
    assert.strictEqual(canAccessView('accountant', 'doctor-room'), false);
    assert.strictEqual(canAccessView('nurse', 'doctor-room'), true);
    assert.strictEqual(canAccessView('nurse', 'billing'), false);
    assert.strictEqual(canAccessView('doctor', 'doctor-room'), true);
    assert.strictEqual(canAccessView('doctor', 'super-admin'), false);
    assert.strictEqual(canAccessView('super_admin', 'super-admin'), true);
    assert.strictEqual(canAccessView('clinic_owner', 'super-admin'), false);
  });

  it('R12: getDefaultViewForRole returns least-privilege landing workspace per role', () => {
    assert.strictEqual(getDefaultViewForRole('patient'), 'patient-portal');
    assert.strictEqual(getDefaultViewForRole('super_admin'), 'super-admin');
    assert.strictEqual(getDefaultViewForRole('doctor'), 'dashboard');
    assert.strictEqual(getDefaultViewForRole('accountant'), 'dashboard');
  });

  it('R13: canEnrollPatients matches firestore.rules isReceptionistOrStaff across all 8 roles', () => {
    assert.strictEqual(ROLE_PERMISSIONS.clinic_owner.canEnrollPatients, true);
    assert.strictEqual(ROLE_PERMISSIONS.clinic_manager.canEnrollPatients, true);
    assert.strictEqual(ROLE_PERMISSIONS.receptionist.canEnrollPatients, true);
    assert.strictEqual(ROLE_PERMISSIONS.nurse.canEnrollPatients, true);

    assert.strictEqual(ROLE_PERMISSIONS.doctor.canEnrollPatients, false);
    assert.strictEqual(ROLE_PERMISSIONS.accountant.canEnrollPatients, false);
    assert.strictEqual(ROLE_PERMISSIONS.patient.canEnrollPatients, false);
    assert.strictEqual(ROLE_PERMISSIONS.super_admin.canEnrollPatients, false);
  });
});
