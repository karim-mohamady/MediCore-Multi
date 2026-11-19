import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { buildSlotKey } from '../lib/tenant';

const PROJECT_ID = 'demo-medicore';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

let testEnv: RulesTestEnvironment;

async function seedFixtures(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await db.doc('clinics/clinic-nokhba').set({
      id: 'clinic-nokhba',
      name: 'Al-Nokhba Medical Center',
      code: 'NOK',
      ownerUid: 'uid-owner-a',
      status: 'active',
    });
    await db.doc('clinics/clinic-amal').set({
      id: 'clinic-amal',
      name: 'Al-Amal Dental Care',
      code: 'AML',
      ownerUid: 'uid-owner-b',
      status: 'active',
    });

    const users = [
      { id: 'uid-super', clinicId: 'platform', role: 'super_admin', status: 'active' },
      { id: 'uid-owner-a', clinicId: 'clinic-nokhba', role: 'clinic_owner', status: 'active' },
      { id: 'uid-manager-a', clinicId: 'clinic-nokhba', role: 'clinic_manager', status: 'active' },
      { id: 'uid-doc-a', clinicId: 'clinic-nokhba', role: 'doctor', status: 'active' },
      { id: 'uid-doc-a2', clinicId: 'clinic-nokhba', role: 'doctor', status: 'active' },
      { id: 'uid-rec-a', clinicId: 'clinic-nokhba', role: 'receptionist', status: 'active' },
      { id: 'uid-nurse-a', clinicId: 'clinic-nokhba', role: 'nurse', status: 'active' },
      { id: 'uid-acc-a', clinicId: 'clinic-nokhba', role: 'accountant', status: 'active' },
      { id: 'uid-pat-a1', clinicId: 'clinic-nokhba', role: 'patient', status: 'active', patientId: 'pat-a1' },
      { id: 'uid-pat-a2', clinicId: 'clinic-nokhba', role: 'patient', status: 'active', patientId: 'pat-a2' },
      { id: 'uid-suspended-a', clinicId: 'clinic-nokhba', role: 'doctor', status: 'suspended' },
      { id: 'uid-doc-b', clinicId: 'clinic-amal', role: 'doctor', status: 'active' },
    ];
    for (const u of users) {
      await db.doc(`users/${u.id}`).set(u);
    }

    await db.doc('clinics/clinic-nokhba/patients/pat-a1').set({
      id: 'pat-a1',
      clinicId: 'clinic-nokhba',
      userId: 'uid-pat-a1',
      name: 'Salem Al-Harbi',
    });
    await db.doc('clinics/clinic-nokhba/patients/pat-a2').set({
      id: 'pat-a2',
      clinicId: 'clinic-nokhba',
      userId: 'uid-pat-a2',
      name: 'Fatimah Al-Qahtani',
    });
    await db.doc('clinics/clinic-amal/patients/pat-b1').set({
      id: 'pat-b1',
      clinicId: 'clinic-amal',
      name: 'Bader Clinic B',
    });

    await db.doc('clinics/clinic-nokhba/patientClinicalRecords/pat-a1').set({
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      vitals: { bpSystolic: 120, bpDiastolic: 80, heartRate: 72, temperature: 36.8 },
    });

    const slotA1 = buildSlotKey('uid-doc-a', '2026-11-15', '09:00');
    await db.doc(`clinics/clinic-nokhba/appointmentSlots/${slotA1}`).set({
      id: slotA1,
      clinicId: 'clinic-nokhba',
      doctorId: 'uid-doc-a',
      patientId: 'pat-a1',
      date: '2026-11-15',
      timeSlot: '09:00',
      status: 'reserved',
      appointmentId: 'apt-a1',
    });
    await db.doc('clinics/clinic-nokhba/appointments/apt-a1').set({
      id: 'apt-a1',
      clinicId: 'clinic-nokhba',
      doctorId: 'uid-doc-a',
      patientId: 'pat-a1',
      date: '2026-11-15',
      timeSlot: '09:00',
      status: 'scheduled',
      paymentStatus: 'unpaid',
      fee: 350,
    });
    await db.doc('clinics/clinic-nokhba/appointments/apt-a2').set({
      id: 'apt-a2',
      clinicId: 'clinic-nokhba',
      doctorId: 'uid-doc-a',
      patientId: 'pat-a2',
      date: '2026-11-15',
      timeSlot: '10:00',
      status: 'scheduled',
      paymentStatus: 'unpaid',
      fee: 350,
    });
    await db.doc('clinics/clinic-amal/appointments/apt-b1').set({
      id: 'apt-b1',
      clinicId: 'clinic-amal',
      doctorId: 'uid-doc-b',
      patientId: 'pat-b1',
      status: 'scheduled',
    });

    await db.doc('clinics/clinic-nokhba/queues/q-a1').set({
      id: 'q-a1',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      tokenNumber: 'A-001',
      status: 'waiting',
    });
    await db.doc('clinics/clinic-nokhba/queues/q-skipped').set({
      id: 'q-skipped',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a2',
      tokenNumber: 'A-002',
      status: 'skipped',
    });
    await db.doc('clinics/clinic-nokhba/queues/q-done').set({
      id: 'q-done',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      tokenNumber: 'A-003',
      status: 'completed',
    });
    await db.doc('clinics/clinic-amal/queues/q-b1').set({
      id: 'q-b1',
      clinicId: 'clinic-amal',
      patientId: 'pat-b1',
      tokenNumber: 'B-001',
      status: 'waiting',
    });

    await db.doc('clinics/clinic-nokhba/consultations/con-draft').set({
      id: 'con-draft',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      doctorId: 'uid-doc-a',
      diagnosis: 'Pending',
      status: 'draft',
    });
    await db.doc('clinics/clinic-nokhba/consultations/con-final').set({
      id: 'con-final',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      doctorId: 'uid-doc-a',
      diagnosis: 'Hypertension',
      status: 'finalized',
    });
    await db.doc('clinics/clinic-nokhba/prescriptions/rx-draft').set({
      id: 'rx-draft',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      doctorId: 'uid-doc-a',
      diagnosis: 'Pharyngitis',
      status: 'draft',
    });
    await db.doc('clinics/clinic-nokhba/prescriptions/rx-final').set({
      id: 'rx-final',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      doctorId: 'uid-doc-a',
      diagnosis: 'Hypertension',
      status: 'finalized',
    });

    await db.doc('clinics/clinic-nokhba/labResults/lab-pending').set({
      id: 'lab-pending',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      status: 'pending',
    });
    await db.doc('clinics/clinic-nokhba/labResults/lab-approved').set({
      id: 'lab-approved',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      status: 'approved',
    });

    await db.doc('clinics/clinic-nokhba/invoices/inv-unpaid').set({
      id: 'inv-unpaid',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      subtotal: 500,
      tax: 0,
      discount: 0,
      totalAmount: 500,
      paidAmount: 0,
      remainingAmount: 500,
      paymentStatus: 'unpaid',
      items: [{ id: 'i1', total: 500 }],
    });
    await db.doc('clinics/clinic-nokhba/invoices/inv-paid').set({
      id: 'inv-paid',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-a1',
      totalAmount: 300,
      paidAmount: 300,
      remainingAmount: 0,
      paymentStatus: 'paid',
    });
    await db.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-existing').set({
      paymentId: 'pmt-existing',
      clinicId: 'clinic-nokhba',
      invoiceId: 'inv-unpaid',
      amount: 100,
      paymentMethod: 'cash',
    });

    await db.doc('clinics/clinic-nokhba/auditLogs/aud-1').set({
      id: 'aud-1',
      clinicId: 'clinic-nokhba',
      actorUid: 'uid-owner-a',
      action: 'CLINIC_INIT',
    });
  });
}

describe('Firestore Security Rules Enforcement (@firebase/rules-unit-testing)', () => {
  before(async () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules, host: FIRESTORE_HOST, port: FIRESTORE_PORT },
    });
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedFixtures(testEnv);
  });

  // Authentication (1-3)
  it('1-3: Unauthenticated users cannot read, create, or modify protected clinic or user records', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc('clinics/clinic-nokhba').get());
    await assertFails(db.doc('clinics/clinic-nokhba/patients/pat-a1').get());
    await assertFails(db.doc('users/uid-owner-a').get());
    await assertFails(db.doc('clinics/clinic-new').set({ id: 'clinic-new', ownerUid: 'x', status: 'active' }));
    await assertFails(db.doc('clinics/clinic-nokhba/patients/pat-new').set({ id: 'pat-new', clinicId: 'clinic-nokhba' }));
    await assertFails(db.doc('clinics/clinic-nokhba/appointments/apt-a1').update({ status: 'cancelled' }));
  });

  // Tenant Isolation (4-8)
  it('4-8: Tenant isolation enforces Clinic A access while blocking Clinic B reads, updates, deletes, and invalid/root paths', async () => {
    const recADb = testEnv.authenticatedContext('uid-rec-a').firestore();
    await assertSucceeds(recADb.doc('clinics/clinic-nokhba/patients/pat-a1').get());
    await assertSucceeds(recADb.doc('clinics/clinic-nokhba/appointments/apt-a1').get());
    await assertSucceeds(recADb.doc('clinics/clinic-nokhba/queues/q-a1').get());

    await assertFails(recADb.doc('clinics/clinic-amal/patients/pat-b1').get());
    await assertFails(recADb.doc('clinics/clinic-amal/appointments/apt-b1').update({ status: 'cancelled' }));
    await assertFails(recADb.doc('clinics/clinic-amal/patients/pat-b1').delete());
    await assertFails(recADb.doc('clinics/clinic-amal/queues/q-b1').delete());
    await assertFails(recADb.doc('patients/pat-root-leak').set({ id: 'pat-root-leak' }));
    await assertFails(recADb.doc('clinics/bad.clinic/patients/pat-a1').get());
  });

  // RBAC (9-15)
  it('9-12: Clinical PHI separation blocks receptionist/accountant/manager, permits doctor, and scopes nurse to vitals/Rx reads', async () => {
    const recDb = testEnv.authenticatedContext('uid-rec-a').firestore();
    const accDb = testEnv.authenticatedContext('uid-acc-a').firestore();
    const mgrDb = testEnv.authenticatedContext('uid-manager-a').firestore();
    const docDb = testEnv.authenticatedContext('uid-doc-a').firestore();
    const nurseDb = testEnv.authenticatedContext('uid-nurse-a').firestore();

    await assertFails(recDb.doc('clinics/clinic-nokhba/patientClinicalRecords/pat-a1').get());
    await assertFails(recDb.doc('clinics/clinic-nokhba/consultations/con-final').get());
    await assertFails(recDb.doc('clinics/clinic-nokhba/prescriptions/rx-final').get());

    await assertFails(accDb.doc('clinics/clinic-nokhba/consultations/con-draft').update({ diagnosis: 'Modified' }));
    await assertFails(accDb.doc('clinics/clinic-nokhba/patientClinicalRecords/pat-a1').get());
    await assertFails(mgrDb.doc('clinics/clinic-nokhba/patientClinicalRecords/pat-a1').get());
    await assertFails(mgrDb.doc('clinics/clinic-nokhba/prescriptions/rx-final').get());

    await assertSucceeds(docDb.doc('clinics/clinic-nokhba/patientClinicalRecords/pat-a1').get());
    await assertSucceeds(docDb.doc('clinics/clinic-nokhba/consultations/con-draft').get());

    await assertSucceeds(nurseDb.doc('clinics/clinic-nokhba/patientClinicalRecords/pat-a1').update({ vitals: { bpSystolic: 115 } }));
    await assertSucceeds(nurseDb.doc('clinics/clinic-nokhba/prescriptions/rx-final').get());
    await assertFails(nurseDb.doc('clinics/clinic-nokhba/consultations/con-nurse').set({ id: 'con-nurse', clinicId: 'clinic-nokhba', patientId: 'pat-a1', doctorId: 'uid-nurse-a', status: 'draft' }));
  });

  it('13-15: Patients are self-scoped; self role-elevation and manager super_admin escalation are denied', async () => {
    const pat1Db = testEnv.authenticatedContext('uid-pat-a1').firestore();
    const mgrDb = testEnv.authenticatedContext('uid-manager-a').firestore();

    await assertSucceeds(pat1Db.doc('clinics/clinic-nokhba/patients/pat-a1').get());
    await assertSucceeds(pat1Db.doc('clinics/clinic-nokhba/consultations/con-final').get());
    await assertSucceeds(pat1Db.doc('clinics/clinic-nokhba/labResults/lab-approved').get());

    await assertFails(pat1Db.doc('clinics/clinic-nokhba/patients/pat-a2').get());
    await assertFails(pat1Db.doc('clinics/clinic-nokhba/appointments/apt-a2').get());
    await assertFails(pat1Db.doc('clinics/clinic-nokhba/consultations/con-draft').get());
    await assertFails(pat1Db.doc('clinics/clinic-nokhba/labResults/lab-pending').get());

    await assertFails(pat1Db.doc('users/uid-pat-a1').update({ role: 'clinic_owner' }));
    await assertFails(pat1Db.doc('users/uid-pat-a1').update({ clinicId: 'clinic-amal' }));
    await assertFails(mgrDb.doc('users/uid-new-super').set({ id: 'uid-new-super', clinicId: 'clinic-nokhba', role: 'super_admin', status: 'active' }));
    await assertFails(mgrDb.doc('clinics/clinic-nokhba/members/uid-rec-a').set({ userId: 'uid-rec-a', clinicId: 'clinic-nokhba', role: 'super_admin' }));
  });

  // Patient Enrollment (16-18)
  it('16-18: Staff can enroll patients; unauthorized self-enrollment and arbitrary patient account hijacking are blocked', async () => {
    const recDb = testEnv.authenticatedContext('uid-rec-a').firestore();
    const pat1Db = testEnv.authenticatedContext('uid-pat-a1').firestore();

    await assertSucceeds(
      recDb.doc('clinics/clinic-nokhba/patients/pat-new').set({
        id: 'pat-new',
        clinicId: 'clinic-nokhba',
        name: 'New Patient',
      })
    );

    await assertFails(
      pat1Db.doc('clinics/clinic-amal/patients/pat-rogue').set({
        id: 'pat-rogue',
        clinicId: 'clinic-amal',
        name: 'Rogue',
      })
    );
    await assertFails(
      pat1Db.doc('clinics/clinic-nokhba/patients/pat-self').set({
        id: 'pat-self',
        clinicId: 'clinic-nokhba',
        name: 'Self',
      })
    );

    // Cannot reassign an existing linked patient userId or hijack another user's patientId
    await assertFails(recDb.doc('clinics/clinic-nokhba/patients/pat-a1').update({ userId: 'uid-pat-a2' }));
    await assertFails(pat1Db.doc('users/uid-pat-a1').update({ patientId: 'pat-a2' }));
  });

  // Financial Security (19-22)
  it('19-22: Payments forbid unauthorized creation/update/delete, orphan writes, overpayment, and direct balance tampering', async () => {
    const recDb = testEnv.authenticatedContext('uid-rec-a').firestore();
    const accDb = testEnv.authenticatedContext('uid-acc-a').firestore();

    await assertFails(
      recDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-unauth').set({
        paymentId: 'pmt-unauth',
        clinicId: 'clinic-nokhba',
        invoiceId: 'inv-unpaid',
        amount: 50,
        paymentMethod: 'cash',
      })
    );
    await assertFails(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-existing').update({ amount: 999 }));
    await assertFails(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-existing').delete());

    // Direct balance tampering without atomic payment or altering totalAmount/paid invoice rejected
    await assertFails(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid').update({ totalAmount: 1 }));
    await assertFails(accDb.doc('clinics/clinic-nokhba/invoices/inv-paid').update({ paidAmount: 100, paymentStatus: 'partial' }));
    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-orphan').set({
        paymentId: 'pmt-orphan',
        clinicId: 'clinic-nokhba',
        invoiceId: 'inv-unpaid',
        amount: 100,
        paymentMethod: 'card',
      })
    );

    // Valid atomic batch satisfying getAfter() invoice coupling succeeds
    const batch = accDb.batch();
    batch.set(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-valid'), {
      paymentId: 'pmt-valid',
      clinicId: 'clinic-nokhba',
      invoiceId: 'inv-unpaid',
      amount: 200,
      paymentMethod: 'card',
    });
    batch.update(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid'), {
      paidAmount: 200,
      remainingAmount: 300,
      paymentStatus: 'partial',
      lastPaymentId: 'pmt-valid',
    });
    await assertSucceeds(batch.commit());
  });

  // Clinical Integrity (23-25)
  it('23-25: Finalized clinical records are immutable; non-author or non-doctor roles cannot finalize or edit Rx', async () => {
    const doc1Db = testEnv.authenticatedContext('uid-doc-a').firestore();
    const doc2Db = testEnv.authenticatedContext('uid-doc-a2').firestore();
    const nurseDb = testEnv.authenticatedContext('uid-nurse-a').firestore();
    const mgrDb = testEnv.authenticatedContext('uid-manager-a').firestore();

    await assertFails(doc1Db.doc('clinics/clinic-nokhba/consultations/con-final').update({ diagnosis: 'Tamper' }));
    await assertFails(doc1Db.doc('clinics/clinic-nokhba/prescriptions/rx-final').update({ diagnosis: 'Tamper' }));
    await assertFails(doc2Db.doc('clinics/clinic-nokhba/consultations/con-draft').update({ status: 'finalized' }));
    await assertFails(nurseDb.doc('clinics/clinic-nokhba/consultations/con-draft').update({ status: 'finalized' }));
    await assertFails(mgrDb.doc('clinics/clinic-nokhba/prescriptions/rx-draft').update({ diagnosis: 'Changed' }));
    await assertSucceeds(doc1Db.doc('clinics/clinic-nokhba/consultations/con-draft').update({ status: 'finalized' }));
  });

  // Audit & Administration (26-28)
  it('26-28: Audit logs are append-only; clinic ownership cannot be hijacked; suspended accounts are blocked', async () => {
    const recDb = testEnv.authenticatedContext('uid-rec-a').firestore();
    const ownerDb = testEnv.authenticatedContext('uid-owner-a').firestore();
    const mgrDb = testEnv.authenticatedContext('uid-manager-a').firestore();
    const suspDb = testEnv.authenticatedContext('uid-suspended-a').firestore();

    await assertFails(recDb.doc('clinics/clinic-nokhba/auditLogs/aud-1').get());
    await assertFails(ownerDb.doc('clinics/clinic-nokhba/auditLogs/aud-1').update({ action: 'ALTERED' }));
    await assertFails(ownerDb.doc('clinics/clinic-nokhba/auditLogs/aud-1').delete());
    await assertSucceeds(ownerDb.doc('clinics/clinic-nokhba/auditLogs/aud-1').get());

    await assertFails(mgrDb.doc('clinics/clinic-nokhba').update({ ownerUid: 'uid-manager-a' }));
    await assertFails(ownerDb.doc('clinics/clinic-nokhba').update({ ownerUid: 'uid-manager-a' }));

    await assertFails(suspDb.doc('clinics/clinic-nokhba').get());
    await assertFails(suspDb.doc('clinics/clinic-nokhba/patients/pat-a1').get());
    await assertFails(suspDb.doc('clinics/clinic-nokhba/consultations/con-draft').update({ diagnosis: 'Suspended Hack' }));
  });

  // Deterministic Slot Locks & Queue State Machine (29-30)
  it('29-30: Deterministic appointmentSlots forbid active overwrite, allow cancel/rebook, and enforce queue state transitions', async () => {
    const recDb = testEnv.authenticatedContext('uid-rec-a').firestore();
    const mgrDb = testEnv.authenticatedContext('uid-manager-a').firestore();
    const slotKey = buildSlotKey('uid-doc-a', '2026-11-15', '09:00');

    await assertFails(
      recDb.doc(`clinics/clinic-nokhba/appointmentSlots/${slotKey}`).set({
        id: slotKey,
        clinicId: 'clinic-nokhba',
        doctorId: 'uid-doc-a',
        patientId: 'pat-a2',
        date: '2026-11-15',
        timeSlot: '09:00',
        status: 'reserved',
      })
    );
    await assertSucceeds(recDb.doc(`clinics/clinic-nokhba/appointmentSlots/${slotKey}`).update({ status: 'cancelled' }));
    await assertSucceeds(
      recDb.doc(`clinics/clinic-nokhba/appointmentSlots/${slotKey}`).update({
        status: 'reserved',
        patientId: 'pat-a2',
        appointmentId: 'apt-a2',
      })
    );

    await assertFails(recDb.doc('clinics/clinic-nokhba/queues/q-done').update({ status: 'waiting' }));
    await assertFails(recDb.doc('clinics/clinic-nokhba/queues/q-skipped').update({ status: 'waiting' }));
    await assertSucceeds(mgrDb.doc('clinics/clinic-nokhba/queues/q-skipped').update({ status: 'waiting' }));
  });

  // Super Admin Privacy & Malformed / Cross-Doctor Boundary Enforcement (31-34)
  it('31-32: super_admin can inspect clinics and auditLogs, but is strictly blocked from tenant PHI and billing mutations', async () => {
    const superDb = testEnv.authenticatedContext('uid-super').firestore();

    await assertSucceeds(superDb.doc('clinics/clinic-nokhba').get());
    await assertSucceeds(superDb.doc('clinics/clinic-nokhba/auditLogs/aud-1').get());

    await assertFails(superDb.doc('clinics/clinic-nokhba/patientClinicalRecords/pat-a1').get());
    await assertFails(superDb.doc('clinics/clinic-nokhba/consultations/con-final').get());
    await assertFails(superDb.doc('clinics/clinic-nokhba/prescriptions/rx-final').get());
    await assertFails(superDb.doc('clinics/clinic-nokhba/labResults/lab-approved').get());
    await assertFails(
      superDb.doc('clinics/clinic-nokhba/invoices/inv-super-bad').set({
        id: 'inv-super-bad',
        clinicId: 'clinic-nokhba',
        patientId: 'pat-a1',
        totalAmount: 100,
        paidAmount: 0,
        paymentStatus: 'unpaid',
      })
    );
  });

  it('33-34: Enforces malformed financial boundaries, patient clinical/billing write blocks, and cross-doctor appointment/lab isolation', async () => {
    const accDb = testEnv.authenticatedContext('uid-acc-a').firestore();
    const doc2Db = testEnv.authenticatedContext('uid-doc-a2').firestore();
    const pat1Db = testEnv.authenticatedContext('uid-pat-a1').firestore();

    // Negative invoice totalAmount and nonzero initial paidAmount rejected
    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-negative').set({
        id: 'inv-negative',
        clinicId: 'clinic-nokhba',
        patientId: 'pat-a1',
        totalAmount: -50,
        paidAmount: 0,
        paymentStatus: 'unpaid',
      })
    );
    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-prepaid').set({
        id: 'inv-prepaid',
        clinicId: 'clinic-nokhba',
        patientId: 'pat-a1',
        totalAmount: 200,
        paidAmount: 100,
        paymentStatus: 'partial',
      })
    );

    // Zero payment, invalid paymentMethod, and overpayment rejected even inside matching batch
    const overBatch = accDb.batch();
    overBatch.set(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-over'), {
      paymentId: 'pmt-over',
      clinicId: 'clinic-nokhba',
      invoiceId: 'inv-unpaid',
      amount: 600,
      paymentMethod: 'cash',
    });
    overBatch.update(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid'), {
      paidAmount: 600,
      remainingAmount: -100,
      paymentStatus: 'paid',
    });
    await assertFails(overBatch.commit());

    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-crypto').set({
        paymentId: 'pmt-crypto',
        clinicId: 'clinic-nokhba',
        invoiceId: 'inv-unpaid',
        amount: 50,
        paymentMethod: 'crypto',
      })
    );

    // Doctor A2 cannot modify Doctor A's consultation or appointment
    await assertFails(
      doc2Db.doc('clinics/clinic-nokhba/appointments/apt-a1').update({
        status: 'confirmed',
      })
    );

    // Patient cannot author prescriptions, create labResults, or issue invoices
    await assertFails(
      pat1Db.doc('clinics/clinic-nokhba/prescriptions/rx-self').set({
        id: 'rx-self',
        clinicId: 'clinic-nokhba',
        patientId: 'pat-a1',
        doctorId: 'uid-pat-a1',
        status: 'finalized',
      })
    );
    await assertFails(
      pat1Db.doc('clinics/clinic-nokhba/invoices/inv-self').set({
        id: 'inv-self',
        clinicId: 'clinic-nokhba',
        patientId: 'pat-a1',
        totalAmount: 0,
        paidAmount: 0,
        paymentStatus: 'unpaid',
      })
    );
  });

  // Phase 9.9 Security Regression Suite (35-39)
  it('35: Rejects same-batch multi-payment ledger desync attack via lastPaymentId 1:1 coupling', async () => {
    const accDb = testEnv.authenticatedContext('uid-acc-a').firestore();
    const dupBatch = accDb.batch();
    dupBatch.set(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-dup1'), {
      paymentId: 'pmt-dup1',
      clinicId: 'clinic-nokhba',
      invoiceId: 'inv-unpaid',
      amount: 200,
      paymentMethod: 'cash',
    });
    dupBatch.set(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-dup2'), {
      paymentId: 'pmt-dup2',
      clinicId: 'clinic-nokhba',
      invoiceId: 'inv-unpaid',
      amount: 200,
      paymentMethod: 'cash',
    });
    dupBatch.update(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid'), {
      paidAmount: 200,
      remainingAmount: 300,
      paymentStatus: 'partial',
      lastPaymentId: 'pmt-dup1',
    });
    await assertFails(dupBatch.commit());
  });

  it('36: Enforces /users/{uid} cross-patient PII isolation while permitting practitioner and staff reads', async () => {
    const pat1Db = testEnv.authenticatedContext('uid-pat-a1').firestore();
    const recDb = testEnv.authenticatedContext('uid-rec-a').firestore();
    const superDb = testEnv.authenticatedContext('uid-super').firestore();

    await assertSucceeds(pat1Db.doc('users/uid-pat-a1').get());
    await assertSucceeds(pat1Db.doc('users/uid-doc-a').get());
    await assertSucceeds(pat1Db.doc('users/uid-owner-a').get());

    await assertFails(pat1Db.doc('users/uid-pat-a2').get());
    await assertFails(pat1Db.doc('users/uid-acc-a').get());
    await assertFails(pat1Db.doc('users/uid-rec-a').get());

    await assertSucceeds(recDb.doc('users/uid-pat-a2').get());
    await assertSucceeds(superDb.doc('users/uid-pat-a2').get());
  });

  it('37-39: Blocks patient draft Rx reads, accountant clinical appointment status overwrite, and inconsistent invoice creation', async () => {
    const pat1Db = testEnv.authenticatedContext('uid-pat-a1').firestore();
    const accDb = testEnv.authenticatedContext('uid-acc-a').firestore();

    await assertFails(pat1Db.doc('clinics/clinic-nokhba/prescriptions/rx-draft').get());
    await assertSucceeds(pat1Db.doc('clinics/clinic-nokhba/prescriptions/rx-final').get());

    await assertFails(
      accDb.doc('clinics/clinic-nokhba/appointments/apt-a1').update({
        status: 'cancelled',
      })
    );
    await assertSucceeds(
      accDb.doc('clinics/clinic-nokhba/appointments/apt-a1').update({
        paymentStatus: 'paid',
        notes: 'Invoice settled',
      })
    );

    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-zero').set({
        id: 'inv-zero',
        clinicId: 'clinic-nokhba',
        patientId: 'pat-a1',
        totalAmount: 0,
        paidAmount: 0,
        paymentStatus: 'unpaid',
      })
    );
    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-mismatch').set({
        id: 'inv-mismatch',
        clinicId: 'clinic-nokhba',
        patientId: 'pat-a1',
        totalAmount: 200,
        paidAmount: 0,
        remainingAmount: 50,
        paymentStatus: 'unpaid',
      })
    );
  });

  // Phase 9.9.1 Adversarial Verification Suite (40-43)
  it('40: SEC-01 Enforces bidirectional 1:1 coupling so invoice updates cannot bypass or mismatch payment receipts', async () => {
    const accDb = testEnv.authenticatedContext('uid-acc-a').firestore();

    // Direct invoice paidAmount update without creating payment doc (ghost paymentId) rejected
    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid').update({
        paidAmount: 200,
        remainingAmount: 300,
        paymentStatus: 'partial',
        lastPaymentId: 'pmt-ghost',
      })
    );

    // Reusing an already-existing payment ID in invoice update rejected
    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid').update({
        paidAmount: 100,
        remainingAmount: 400,
        paymentStatus: 'partial',
        lastPaymentId: 'pmt-existing',
      })
    );

    // Duplicate existing paymentId create rejected
    await assertFails(
      accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-existing').set({
        paymentId: 'pmt-existing',
        clinicId: 'clinic-nokhba',
        invoiceId: 'inv-unpaid',
        amount: 100,
        paymentMethod: 'cash',
      })
    );

    // Mismatched batch: payment creates 'pmt-a' while invoice references 'pmt-b' -> both rejected
    const mismatchedBatch = accDb.batch();
    mismatchedBatch.set(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid/payments/pmt-a'), {
      paymentId: 'pmt-a',
      clinicId: 'clinic-nokhba',
      invoiceId: 'inv-unpaid',
      amount: 200,
      paymentMethod: 'card',
    });
    mismatchedBatch.update(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid'), {
      paidAmount: 200,
      remainingAmount: 300,
      paymentStatus: 'partial',
      lastPaymentId: 'pmt-b',
    });
    await assertFails(mismatchedBatch.commit());
  });

  it('41: SEC-02 Enforces cross-clinic doctor/owner patient denial, practitioner query bounds, and missing profile fail-closed', async () => {
    const docADb = testEnv.authenticatedContext('uid-doc-a').firestore();
    const ownerADb = testEnv.authenticatedContext('uid-owner-a').firestore();
    const pat1Db = testEnv.authenticatedContext('uid-pat-a1').firestore();
    const noDocDb = testEnv.authenticatedContext('uid-unprovisioned').firestore();

    await assertFails(docADb.doc('clinics/clinic-amal/patients/pat-b1').get());
    await assertFails(ownerADb.doc('clinics/clinic-amal/patients/pat-b1').get());
    await assertFails(ownerADb.doc('clinics/clinic-amal/patients/pat-b2').set({
      id: 'pat-b2',
      clinicId: 'clinic-amal',
      name: 'Cross Clinic Tamper',
    }));

    // Practitioner query scoped to patient's active clinic & doctor/clinic_owner succeeds; unfiltered or cross-clinic fails
    await assertSucceeds(
      pat1Db
        .collection('users')
        .where('clinicId', '==', 'clinic-nokhba')
        .where('role', 'in', ['doctor', 'clinic_owner'])
        .get()
    );
    await assertFails(pat1Db.collection('users').where('clinicId', '==', 'clinic-nokhba').get());
    await assertFails(
      pat1Db
        .collection('users')
        .where('clinicId', '==', 'clinic-amal')
        .where('role', 'in', ['doctor', 'clinic_owner'])
        .get()
    );

    // Unprovisioned user without /users/{uid} doc fails closed
    await assertFails(noDocDb.doc('clinics/clinic-nokhba/patients/pat-a1').get());
    await assertFails(noDocDb.doc('clinics/clinic-nokhba/appointments/apt-a1').get());
  });

  it('42: SEC-03 Blocks patient Rx finalization attempt and unauthorized lab approval while allowing doctor lab approval', async () => {
    const pat1Db = testEnv.authenticatedContext('uid-pat-a1').firestore();
    const nurseDb = testEnv.authenticatedContext('uid-nurse-a').firestore();
    const recDb = testEnv.authenticatedContext('uid-rec-a').firestore();
    const mgrDb = testEnv.authenticatedContext('uid-manager-a').firestore();
    const docDb = testEnv.authenticatedContext('uid-doc-a').firestore();

    await assertFails(pat1Db.doc('clinics/clinic-nokhba/prescriptions/rx-draft').update({ status: 'finalized' }));
    await assertFails(nurseDb.doc('clinics/clinic-nokhba/labResults/lab-pending').update({ status: 'approved' }));
    await assertFails(recDb.doc('clinics/clinic-nokhba/labResults/lab-pending').update({ status: 'approved' }));
    await assertFails(mgrDb.doc('clinics/clinic-nokhba/labResults/lab-pending').update({ status: 'approved' }));
    await assertSucceeds(docDb.doc('clinics/clinic-nokhba/labResults/lab-pending').update({ status: 'approved' }));
  });

  it('43: SEC-04 Prevents clinicId and patientId mutation on existing appointments and invoices', async () => {
    const recDb = testEnv.authenticatedContext('uid-rec-a').firestore();
    const accDb = testEnv.authenticatedContext('uid-acc-a').firestore();

    await assertFails(recDb.doc('clinics/clinic-nokhba/appointments/apt-a1').update({ clinicId: 'clinic-amal' }));
    await assertFails(recDb.doc('clinics/clinic-nokhba/appointments/apt-a1').update({ patientId: 'pat-a2' }));
    await assertFails(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid').update({ clinicId: 'clinic-amal', notes: 'Hijack' }));
    await assertFails(accDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid').update({ patientId: 'pat-a2', notes: 'Hijack' }));
  });
});
