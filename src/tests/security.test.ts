import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateTenantAccess, TenantAccessError, buildTenantPath } from '../lib/tenant';
import { checkRolePermission, assertClinicalRecordModifiable, AuthorizationError } from '../lib/permissions';

describe('MediCore Security & Tenant Isolation Tests', () => {
  it('TEST A: Clinic A member cannot read or modify Clinic B records', () => {
    assert.throws(
      () => validateTenantAccess('clinic-nokhba', 'clinic-amal', 'receptionist'),
      (err: any) => err instanceof TenantAccessError && err.message.includes('Access Denied')
    );
  });

  it('TEST B: Clinic A member can access Clinic A records', () => {
    assert.doesNotThrow(() => {
      validateTenantAccess('clinic-nokhba', 'clinic-nokhba', 'receptionist');
    });
  });

  it('TEST C: Super Admin can access any tenant records', () => {
    assert.doesNotThrow(() => {
      validateTenantAccess('clinic-nokhba', 'clinic-amal', 'super_admin');
    });
  });

  it('TEST D: Receptionist cannot access or modify protected patient PHI clinical notes', () => {
    assert.throws(
      () => checkRolePermission('receptionist', 'canAccessPHI'),
      (err: any) => err instanceof AuthorizationError
    );
  });

  it('TEST E: Doctor is authorized to access PHI and clinical records', () => {
    assert.doesNotThrow(() => {
      checkRolePermission('doctor', 'canAccessPHI');
      checkRolePermission('doctor', 'canModifyClinicalRecords');
    });
  });

  it('TEST F: Receptionist is authorized to manage waiting queue and appointments', () => {
    assert.doesNotThrow(() => {
      checkRolePermission('receptionist', 'canManageQueue');
      checkRolePermission('receptionist', 'canScheduleAppointments');
    });
  });

  it('TEST G: Finalized clinical records are immutable and reject modification', () => {
    assert.throws(
      () => assertClinicalRecordModifiable('finalized'),
      (err: any) => err instanceof AuthorizationError && err.message.includes('immutable')
    );
  });

  it('TEST H: Draft clinical records permit modifications by doctor', () => {
    assert.doesNotThrow(() => {
      assertClinicalRecordModifiable('draft');
    });
  });

  it('TEST I: Accountant cannot modify clinical medical records', () => {
    assert.throws(
      () => checkRolePermission('accountant', 'canModifyClinicalRecords'),
      (err: any) => err instanceof AuthorizationError
    );
  });

  it('TEST J: Canonical tenant path generation prevents root collection leakage', () => {
    const path = buildTenantPath('clinic-nokhba', 'patients', 'pat-101');
    assert.strictEqual(path, 'clinics/clinic-nokhba/patients/pat-101');
  });
});
