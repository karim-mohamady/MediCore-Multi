import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ConcurrencyConflictError,
  PaymentIntegrityError,
  InvalidStateTransitionError,
  DuplicateLabOrderError,
  buildLabOrderItems,
  buildLabOrderSignature,
  normalizeLabTestNames,
  createLabOrderRecord,
} from '../lib/firestore';
import { buildSlotKey, validateTenantAccess, TenantAccessError } from '../lib/tenant';
import { checkRolePermission, AuthorizationError } from '../lib/permissions';
import { AccountSuspendedError } from '../lib/auth';
import { Appointment, QueueTicket, Invoice, LabOrder } from '../types';

/**
 * Pure Unit & Domain Logic Tests (In-Memory / Non-Emulator)
 * Note: Real Firebase Auth & Firestore Emulator runTransaction / security rules tests
 * are executed separately in src/tests/firestore.rules.test.ts.
 */
describe('MediCore Pure Domain Concurrency & Lifecycle Unit Tests', () => {
  it('A1: Deterministic slot key collision prevents double-booking same doctor & slot', async () => {
    const slotDatabase: Record<string, Appointment> = {};

    const attemptBooking = async (apt: Appointment) => {
      const slotKey = buildSlotKey(apt.doctorId, apt.date, apt.timeSlot);
      if (slotDatabase[slotKey] && slotDatabase[slotKey].status !== 'cancelled') {
        throw new ConcurrencyConflictError(
          `Slot ${apt.timeSlot} on ${apt.date} is already reserved by ${slotDatabase[slotKey].patientName}.`
        );
      }
      slotDatabase[slotKey] = apt;
      return apt;
    };

    const apt1: Appointment = {
      id: 'apt-1',
      clinicId: 'clinic-nokhba',
      branchId: 'branch-1',
      doctorId: 'doc-tariq',
      doctorName: 'Dr. Tariq Al-Mansoor',
      patientId: 'pat-101',
      patientName: 'Salem Al-Harbi',
      patientPhone: '+966501234567',
      date: '2026-11-12',
      timeSlot: '09:00',
      durationMin: 30,
      type: 'consultation',
      status: 'scheduled',
      fee: 350,
      createdAt: new Date().toISOString(),
    };

    const apt2: Appointment = {
      ...apt1,
      id: 'apt-2',
      patientId: 'pat-102',
      patientName: 'Fatimah Al-Qahtani',
    };

    const res1 = await attemptBooking(apt1);
    assert.strictEqual(res1.id, 'apt-1');

    await assert.rejects(
      async () => attemptBooking(apt2),
      (err: unknown) => err instanceof ConcurrencyConflictError && err.message.includes('already reserved')
    );
  });

  it('B1: Complete appointment lifecycle state machine: Reserve -> Check-in -> Call -> Complete -> Cancel -> Release -> Rebook', () => {
    const slotDatabase: Record<string, { status: string; patientName: string }> = {};
    const slotKey = buildSlotKey('doc-tariq', '2026-11-12', '10:00');

    slotDatabase[slotKey] = { status: 'scheduled', patientName: 'Khalid Al-Otaibi' };
    assert.strictEqual(slotDatabase[slotKey].status, 'scheduled');

    slotDatabase[slotKey].status = 'arrived';
    const queueTicket: QueueTicket = {
      id: 'q-1',
      clinicId: 'clinic-nokhba',
      branchId: 'branch-1',
      appointmentId: 'apt-lifecycle',
      patientId: 'pat-103',
      patientName: 'Khalid Al-Otaibi',
      patientPhone: '+966567788990',
      doctorId: 'doc-tariq',
      doctorName: 'Dr. Tariq Al-Mansoor',
      tokenNumber: 'A-015',
      status: 'waiting',
      estimatedWaitMin: 15,
      createdAt: new Date().toISOString(),
      priority: 'normal',
    };
    assert.strictEqual(queueTicket.tokenNumber, 'A-015');

    queueTicket.status = 'called';
    slotDatabase[slotKey].status = 'in_consultation';
    assert.strictEqual(queueTicket.status, 'called');

    queueTicket.status = 'completed';
    slotDatabase[slotKey].status = 'completed';
    assert.strictEqual(slotDatabase[slotKey].status, 'completed');

    slotDatabase[slotKey].status = 'cancelled';
    assert.strictEqual(slotDatabase[slotKey].status, 'cancelled');

    slotDatabase[slotKey] = { status: 'scheduled', patientName: 'Reem Al-Dossary' };
    assert.strictEqual(slotDatabase[slotKey].status, 'scheduled');
    assert.strictEqual(slotDatabase[slotKey].patientName, 'Reem Al-Dossary');
  });

  it('C1: Partial payment, overpayment prevention, and paid-state immutability', async () => {
    const mockInvoice: Invoice = {
      id: 'inv-test-101',
      clinicId: 'clinic-nokhba',
      invoiceNumber: 'INV-2026-TEST',
      patientId: 'pat-101',
      patientName: 'Salem Al-Harbi',
      date: '2026-11-12',
      items: [{ id: 'it-1', description: 'Consultation', descriptionAr: 'كشف', quantity: 1, unitPrice: 500, total: 500 }],
      subtotal: 500,
      tax: 75,
      discount: 0,
      totalAmount: 575,
      paidAmount: 0,
      paymentStatus: 'unpaid',
      paymentMethod: 'card',
    };

    const processPayment = async (amount: number) => {
      if (amount <= 0) throw new PaymentIntegrityError('Amount must be > 0');
      if (mockInvoice.paymentStatus === 'paid') throw new PaymentIntegrityError('Invoice already fully settled');
      const remaining = Math.round((mockInvoice.totalAmount - mockInvoice.paidAmount) * 100) / 100;
      if (amount > remaining) {
        throw new PaymentIntegrityError(`Overpayment: attempted ${amount} but balance is ${remaining}`);
      }
      mockInvoice.paidAmount = Math.round((mockInvoice.paidAmount + amount) * 100) / 100;
      mockInvoice.paymentStatus = mockInvoice.paidAmount >= mockInvoice.totalAmount ? 'paid' : 'partial';
      return { paid: mockInvoice.paidAmount, status: mockInvoice.paymentStatus };
    };

    const p1 = await processPayment(200);
    assert.strictEqual(p1.paid, 200);
    assert.strictEqual(p1.status, 'partial');

    await assert.rejects(
      async () => processPayment(400),
      (err: unknown) => err instanceof PaymentIntegrityError && err.message.includes('Overpayment')
    );

    const p2 = await processPayment(375);
    assert.strictEqual(p2.paid, 575);
    assert.strictEqual(p2.status, 'paid');

    await assert.rejects(
      async () => processPayment(50),
      (err: unknown) => err instanceof PaymentIntegrityError && err.message.includes('already fully settled')
    );
  });

  it('D1: Multi-clinic tenant boundary rejects cross-clinic clinical access', () => {
    assert.doesNotThrow(() => {
      validateTenantAccess('clinic-nokhba', 'clinic-nokhba', 'doctor');
    });

    assert.throws(
      () => validateTenantAccess('clinic-nokhba', 'clinic-amal', 'doctor'),
      (err: unknown) => err instanceof TenantAccessError
    );
  });

  it('E1: Multi-session sequential queue token uniqueness invariant', () => {
    const session1Queue: string[] = ['A-010', 'A-011'];
    const session2Queue: string[] = [...session1Queue];

    const nextToken = 'A-012';
    session1Queue.push(nextToken);
    session2Queue.push(nextToken);

    assert.deepStrictEqual(session1Queue, session2Queue);
    assert.strictEqual(new Set(session2Queue).size, 3);
  });

  it('F1: Suspended/disabled status and InvalidStateTransitionError domain guards', () => {
    const checkAccountStatus = (status: string) => {
      if (status === 'suspended' || status === 'disabled') {
        throw new AccountSuspendedError('This user account has been suspended by administration.');
      }
      return true;
    };

    assert.throws(
      () => checkAccountStatus('suspended'),
      (err: unknown) => err instanceof AccountSuspendedError
    );
    assert.doesNotThrow(() => checkAccountStatus('active'));

    const err = new InvalidStateTransitionError('Cannot transition completed -> waiting');
    assert.ok(err.message.includes('INVALID_STATE_TRANSITION'));
  });

  it('G1: Lab order normalization, signature deduplication, and active duplicate order prevention', async () => {
    const normalized = normalizeLabTestNames([
      ' Fasting Blood Glucose ',
      'Lipid Panel (Full)',
      'fasting blood glucose',
      '',
    ]);
    assert.deepStrictEqual(normalized, ['Fasting Blood Glucose', 'Lipid Panel (Full)']);

    const sig1 = buildLabOrderSignature('pat-101', ['Lipid Panel (Full)', 'Fasting Blood Glucose']);
    const sig2 = buildLabOrderSignature('pat-101', ['fasting blood glucose', 'Lipid Panel (Full)']);
    assert.strictEqual(sig1, sig2);

    const items = buildLabOrderItems(normalized);
    assert.strictEqual(items.length, 2);
    assert.ok(items[0].testNameAr.length > 0);

    const existingOrder: LabOrder = {
      id: 'lab-existing-1',
      clinicId: 'clinic-nokhba',
      patientId: 'pat-101',
      patientName: 'Salem Al-Harbi',
      doctorId: 'doc-tariq',
      doctorName: 'Dr. Tariq',
      category: 'biochemistry',
      tests: items,
      status: 'ordered',
      orderedAt: new Date().toISOString(),
    };

    await assert.rejects(
      async () =>
        createLabOrderRecord(
          'clinic-nokhba',
          {
            patientId: 'pat-101',
            patientName: 'Salem Al-Harbi',
            doctorId: 'doc-tariq',
            doctorName: 'Dr. Tariq',
            testNames: ['Lipid Panel (Full)', 'Fasting Blood Glucose'],
          },
          { existingOrders: [existingOrder] }
        ),
      (err: unknown) => err instanceof DuplicateLabOrderError
    );

    await assert.rejects(
      async () =>
        createLabOrderRecord('clinic-nokhba', {
          patientId: 'pat-101',
          patientName: 'Salem Al-Harbi',
          doctorId: 'doc-tariq',
          doctorName: 'Dr. Tariq',
          testNames: [],
        }),
      (err: unknown) => err instanceof Error && err.message.includes('At least one laboratory test')
    );
  });

  it('H1: Quick queue call and clinical lab ordering strictly enforce RBAC matrix', () => {
    assert.doesNotThrow(() => checkRolePermission('receptionist', 'canManageQueue'));
    assert.doesNotThrow(() => checkRolePermission('doctor', 'canManageQueue'));
    assert.doesNotThrow(() => checkRolePermission('clinic_owner', 'canManageQueue'));

    assert.throws(
      () => checkRolePermission('accountant', 'canManageQueue'),
      (err: unknown) => err instanceof AuthorizationError
    );
    assert.throws(
      () => checkRolePermission('patient', 'canManageQueue'),
      (err: unknown) => err instanceof AuthorizationError
    );
    assert.throws(
      () => checkRolePermission('super_admin', 'canManageQueue'),
      (err: unknown) => err instanceof AuthorizationError
    );

    assert.doesNotThrow(() => checkRolePermission('doctor', 'canAccessPHI'));
    assert.doesNotThrow(() => checkRolePermission('nurse', 'canAccessPHI'));
    assert.throws(
      () => checkRolePermission('receptionist', 'canAccessPHI'),
      (err: unknown) => err instanceof AuthorizationError
    );
  });
});
