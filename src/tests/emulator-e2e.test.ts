import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  updateDoc,
  terminate,
} from 'firebase/firestore';
import {
  onboardClinicTransaction,
  bookAppointmentWithSlotTransaction,
  cancelAppointmentTransaction,
  rescheduleAppointmentTransaction,
  checkInPatientTransaction,
  updateQueueTicketStatusTransaction,
  savePrescriptionTransaction,
  createLabOrderRecord,
  recordPaymentTransaction,
  fetchClinicPaymentsForInvoices,
  subscribeClinicQueue,
  ConcurrencyConflictError,
  PaymentIntegrityError,
  InvalidStateTransitionError,
  DuplicateLabOrderError,
} from '../lib/firestore';
import { buildSlotKey } from '../lib/tenant';
import { QueueTicket } from '../types';

const PROJECT_ID = 'demo-medicore';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_URL = 'http://127.0.0.1:9099';

let testEnv: RulesTestEnvironment;
let appSession1: FirebaseApp;
let appSession2: FirebaseApp;

async function ensureAuthUser(app: FirebaseApp, email: string, pass: string) {
  const appAuth = getAuth(app);
  try {
    await createUserWithEmailAndPassword(appAuth, email, pass);
  } catch {
    await signInWithEmailAndPassword(appAuth, email, pass);
  }
  return appAuth.currentUser!;
}

async function seedClinicAndUsers() {
  const recUser = await ensureAuthUser(appSession1, 'rec-e2e@medicore.test', 'TestPass123!');
  const docUser = await ensureAuthUser(appSession2, 'doc-e2e@medicore.test', 'TestPass123!');

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await adminDb.doc('clinics/clinic-nokhba').set({
      id: 'clinic-nokhba',
      name: 'Al-Nokhba Medical Center',
      code: 'NOK',
      ownerUid: 'uid-owner-a',
      status: 'active',
    });
    await adminDb.doc(`users/${recUser.uid}`).set({
      id: recUser.uid,
      clinicId: 'clinic-nokhba',
      role: 'receptionist',
      status: 'active',
      name: 'E2E Receptionist',
    });
    await adminDb.doc(`users/${docUser.uid}`).set({
      id: docUser.uid,
      clinicId: 'clinic-nokhba',
      role: 'doctor',
      status: 'active',
      name: 'E2E Doctor',
    });
    await adminDb.doc('clinics/clinic-nokhba/patients/pat-a1').set({
      id: 'pat-a1',
      clinicId: 'clinic-nokhba',
      name: 'Salem Al-Harbi',
      phone: '+966501234567',
      balance: 500,
    });
    await adminDb.doc('clinics/clinic-nokhba/patients/pat-a2').set({
      id: 'pat-a2',
      clinicId: 'clinic-nokhba',
      name: 'Fatimah Al-Qahtani',
      phone: '+966559876543',
      balance: 0,
    });
    await adminDb.doc('clinics/clinic-nokhba/invoices/inv-unpaid').set({
      id: 'inv-unpaid',
      clinicId: 'clinic-nokhba',
      invoiceNumber: 'INV-E2E-1',
      patientId: 'pat-a1',
      patientName: 'Salem Al-Harbi',
      subtotal: 500,
      tax: 0,
      discount: 0,
      totalAmount: 500,
      paidAmount: 0,
      remainingAmount: 500,
      paymentStatus: 'unpaid',
      items: [{ id: 'i1', description: 'Consultation', total: 500 }],
    });
  });

  return { recUid: recUser.uid, docUid: docUser.uid };
}

describe('Real Firebase Emulator Concurrency, Payment & Queue E2E Tests', () => {
  before(async () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules, host: FIRESTORE_HOST, port: FIRESTORE_PORT },
    });

    appSession1 = initializeApp({ apiKey: 'demo-key', authDomain: 'demo-medicore.firebaseapp.com', projectId: PROJECT_ID }, 'e2e-s1');
    appSession2 = initializeApp({ apiKey: 'demo-key', authDomain: 'demo-medicore.firebaseapp.com', projectId: PROJECT_ID }, 'e2e-s2');
    connectAuthEmulator(getAuth(appSession1), AUTH_URL, { disableWarnings: true });
    connectAuthEmulator(getAuth(appSession2), AUTH_URL, { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(appSession1), FIRESTORE_HOST, FIRESTORE_PORT);
    connectFirestoreEmulator(getFirestore(appSession2), FIRESTORE_HOST, FIRESTORE_PORT);
  });

  after(async () => {
    await terminate(getFirestore(appSession1)).catch(() => {});
    await terminate(getFirestore(appSession2)).catch(() => {});
    await deleteApp(appSession1).catch(() => {});
    await deleteApp(appSession2).catch(() => {});
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await firebaseSignOut(getAuth(appSession1)).catch(() => {});
    await firebaseSignOut(getAuth(appSession2)).catch(() => {});
  });

  it('C1: Concurrent Promise.all booking reserves strictly 1 winner and leaves no orphaned second appointment', async () => {
    const { docUid } = await seedClinicAndUsers();
    const db1 = getFirestore(appSession1);
    const db2 = getFirestore(appSession2);

    const [r1, r2] = await Promise.allSettled([
      bookAppointmentWithSlotTransaction(
        'clinic-nokhba',
        {
          clinicId: 'clinic-nokhba',
          branchId: 'br-1',
          doctorId: docUid,
          doctorName: 'E2E Doctor',
          patientId: 'pat-a1',
          patientName: 'Salem Al-Harbi',
          patientPhone: '+966501234567',
          date: '2026-11-20',
          timeSlot: '11:00',
          durationMin: 30,
          type: 'consultation',
          status: 'scheduled',
          fee: 350,
        },
        { appointmentId: 'apt-race-1' },
        db1
      ),
      bookAppointmentWithSlotTransaction(
        'clinic-nokhba',
        {
          clinicId: 'clinic-nokhba',
          branchId: 'br-1',
          doctorId: docUid,
          doctorName: 'E2E Doctor',
          patientId: 'pat-a2',
          patientName: 'Fatimah Al-Qahtani',
          patientPhone: '+966559876543',
          date: '2026-11-20',
          timeSlot: '11:00',
          durationMin: 30,
          type: 'consultation',
          status: 'scheduled',
          fee: 350,
        },
        { appointmentId: 'apt-race-2' },
        db2
      ),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    assert.strictEqual(fulfilled.length, 1);
    assert.strictEqual(rejected.length, 1);

    const loserId = r1.status === 'rejected' ? 'apt-race-1' : 'apt-race-2';
    const loserSnap = await getDoc(doc(db1, 'clinics/clinic-nokhba/appointments', loserId));
    assert.strictEqual(loserSnap.exists(), false, 'Failed booking must not leave orphaned appointment record');

    // Subsequent attempt on occupied slot must throw ConcurrencyConflictError cleanly
    await assert.rejects(
      bookAppointmentWithSlotTransaction(
        'clinic-nokhba',
        {
          clinicId: 'clinic-nokhba',
          branchId: 'br-1',
          doctorId: docUid,
          doctorName: 'E2E Doctor',
          patientId: 'pat-a2',
          patientName: 'Fatimah Al-Qahtani',
          patientPhone: '+966559876543',
          date: '2026-11-20',
          timeSlot: '11:00',
          durationMin: 30,
          type: 'consultation',
          status: 'scheduled',
          fee: 350,
        },
        { appointmentId: 'apt-race-3' },
        db1
      ),
      (err: unknown) => err instanceof ConcurrencyConflictError
    );
  });

  it('C2: Cancellation releases slot for rebooking; reschedule atomically swaps slot lock and rejects invalid transitions', async () => {
    const { docUid } = await seedClinicAndUsers();
    const db1 = getFirestore(appSession1);

    const apt = await bookAppointmentWithSlotTransaction(
      'clinic-nokhba',
      {
        clinicId: 'clinic-nokhba',
        branchId: 'br-1',
        doctorId: docUid,
        doctorName: 'E2E Doctor',
        patientId: 'pat-a1',
        patientName: 'Salem Al-Harbi',
        patientPhone: '+966501234567',
        date: '2026-11-21',
        timeSlot: '14:00',
        durationMin: 30,
        type: 'consultation',
        status: 'scheduled',
        fee: 350,
      },
      { appointmentId: 'apt-c2' },
      db1
    );

    await cancelAppointmentTransaction('clinic-nokhba', apt.id, db1);

    // Double cancel rejects as invalid transition
    await assert.rejects(
      cancelAppointmentTransaction('clinic-nokhba', apt.id, db1),
      (err: unknown) => err instanceof InvalidStateTransitionError
    );

    // Freed slot 14:00 can be rebooked
    const rebooked = await bookAppointmentWithSlotTransaction(
      'clinic-nokhba',
      {
        clinicId: 'clinic-nokhba',
        branchId: 'br-1',
        doctorId: docUid,
        doctorName: 'E2E Doctor',
        patientId: 'pat-a2',
        patientName: 'Fatimah Al-Qahtani',
        patientPhone: '+966559876543',
        date: '2026-11-21',
        timeSlot: '14:00',
        durationMin: 30,
        type: 'consultation',
        status: 'scheduled',
        fee: 350,
      },
      { appointmentId: 'apt-c2-rebook' },
      db1
    );

    await rescheduleAppointmentTransaction('clinic-nokhba', rebooked.id, '2026-11-21', '15:00', db1);
    const oldSlot = await getDoc(doc(db1, 'clinics/clinic-nokhba/appointmentSlots', buildSlotKey(docUid, '2026-11-21', '14:00')));
    const newSlot = await getDoc(doc(db1, 'clinics/clinic-nokhba/appointmentSlots', buildSlotKey(docUid, '2026-11-21', '15:00')));
    assert.strictEqual(oldSlot.data()?.status, 'cancelled');
    assert.strictEqual(newSlot.data()?.status, 'reserved');
  });

  it('C3: Multi-session live queue check-in -> real-time onSnapshot sync -> Rx finalization & post-finalization immutability', async () => {
    const { docUid } = await seedClinicAndUsers();
    const recDb = getFirestore(appSession1);
    const docDb = getFirestore(appSession2);

    const apt = await bookAppointmentWithSlotTransaction(
      'clinic-nokhba',
      {
        clinicId: 'clinic-nokhba',
        branchId: 'br-1',
        doctorId: docUid,
        doctorName: 'E2E Doctor',
        patientId: 'pat-a1',
        patientName: 'Salem Al-Harbi',
        patientPhone: '+966501234567',
        date: '2026-11-22',
        timeSlot: '10:30',
        durationMin: 30,
        type: 'consultation',
        status: 'scheduled',
        fee: 350,
      },
      { appointmentId: 'apt-q-e2e' },
      recDb
    );

    let syncedTickets: QueueTicket[] = [];
    let markSynced!: () => void;
    const syncedPromise = new Promise<void>((res) => {
      markSynced = res;
    });

    const unsub = subscribeClinicQueue(
      'clinic-nokhba',
      (tickets) => {
        syncedTickets = tickets;
        if (tickets.some((t) => t.tokenNumber === 'A-099')) markSynced();
      },
      undefined,
      undefined,
      docDb
    );

    try {
      const ticket = await checkInPatientTransaction('clinic-nokhba', apt.id, 'A-099', 15, 'normal', recDb);
      await syncedPromise;
      assert.ok(syncedTickets.some((t) => t.id === ticket.id && t.tokenNumber === 'A-099'));

      await updateQueueTicketStatusTransaction('clinic-nokhba', ticket.id, 'called', recDb);
      await updateQueueTicketStatusTransaction('clinic-nokhba', ticket.id, 'in_room', docDb);

      const rx = await savePrescriptionTransaction(
        'clinic-nokhba',
        {
          patientId: 'pat-a1',
          patientName: 'Salem Al-Harbi',
          doctorId: docUid,
          doctorName: 'E2E Doctor',
          appointmentId: apt.id,
          date: '2026-11-22',
          diagnosis: 'Allergic Rhinitis',
          medications: [{ name: 'Cetirizine 10mg', dosage: '1 tab', frequency: 'OD', duration: '7d' }],
          status: 'finalized',
        },
        { queueTicketId: ticket.id },
        docDb
      );

      const doneApt = await getDoc(doc(docDb, 'clinics/clinic-nokhba/appointments', apt.id));
      const doneQueue = await getDoc(doc(docDb, 'clinics/clinic-nokhba/queues', ticket.id));
      assert.strictEqual(doneApt.data()?.status, 'completed');
      assert.strictEqual(doneQueue.data()?.status, 'completed');

      await assert.rejects(
        updateDoc(doc(docDb, 'clinics/clinic-nokhba/prescriptions', rx.id), { diagnosis: 'Tampered' })
      );
    } finally {
      unsub();
    }
  });

  it('C4: Concurrent & sequential recordPaymentTransaction prevents overpayment, handles idempotency, and persists immutable ledger', async () => {
    await seedClinicAndUsers();
    const accUser = await ensureAuthUser(appSession1, 'acc-e2e@medicore.test', 'TestPass123!');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${accUser.uid}`).set({
        id: accUser.uid,
        clinicId: 'clinic-nokhba',
        role: 'accountant',
        status: 'active',
        name: 'E2E Accountant',
      });
    });

    const accDb = getFirestore(appSession1);

    const p1 = await recordPaymentTransaction(
      'clinic-nokhba',
      'inv-unpaid',
      {
        amount: 200,
        paymentMethod: 'card',
        cashierName: 'E2E Accountant',
        patientName: 'Salem Al-Harbi',
        idempotencyKey: 'idem-200',
      },
      accDb
    );
    assert.strictEqual(p1.invoice.paidAmount, 200);
    assert.strictEqual(p1.invoice.paymentStatus, 'partial');

    const replay = await recordPaymentTransaction(
      'clinic-nokhba',
      'inv-unpaid',
      {
        amount: 200,
        paymentMethod: 'card',
        cashierName: 'E2E Accountant',
        patientName: 'Salem Al-Harbi',
        idempotencyKey: 'idem-200',
      },
      accDb
    );
    assert.strictEqual(replay.idempotentReplay, true);
    assert.strictEqual(replay.invoice.paidAmount, 200);

    // Concurrent two 200 SAR attempts when only 300 SAR remains -> at most 1 succeeds, 1 rejects overpayment
    const [race1, race2] = await Promise.allSettled([
      recordPaymentTransaction(
        'clinic-nokhba',
        'inv-unpaid',
        { amount: 200, paymentMethod: 'cash', cashierName: 'A', patientName: 'Salem Al-Harbi', idempotencyKey: 'race-a' },
        accDb
      ),
      recordPaymentTransaction(
        'clinic-nokhba',
        'inv-unpaid',
        { amount: 200, paymentMethod: 'cash', cashierName: 'B', patientName: 'Salem Al-Harbi', idempotencyKey: 'race-b' },
        accDb
      ),
    ]);
    const raceSuccess = [race1, race2].filter((r) => r.status === 'fulfilled');
    const raceRejected = [race1, race2].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    assert.strictEqual(raceSuccess.length, 1);
    assert.strictEqual(raceRejected.length, 1);

    // Sequential overpayment attempt (> 100 SAR remaining) must reject with PaymentIntegrityError
    await assert.rejects(
      recordPaymentTransaction(
        'clinic-nokhba',
        'inv-unpaid',
        { amount: 150, paymentMethod: 'cash', cashierName: 'A', patientName: 'Salem Al-Harbi', idempotencyKey: 'over-150' },
        accDb
      ),
      (err: unknown) => err instanceof PaymentIntegrityError
    );

    // Settle remaining 100 SAR
    const pFinal = await recordPaymentTransaction(
      'clinic-nokhba',
      'inv-unpaid',
      { amount: 100, paymentMethod: 'cash', cashierName: 'A', patientName: 'Salem Al-Harbi', idempotencyKey: 'settle-100' },
      accDb
    );
    assert.strictEqual(pFinal.invoice.paidAmount, 500);
    assert.strictEqual(pFinal.invoice.paymentStatus, 'paid');

    const ledger = await fetchClinicPaymentsForInvoices('clinic-nokhba', ['inv-unpaid'], accDb);
    assert.strictEqual(ledger.length, 3);
    assert.strictEqual(ledger.reduce((s, e) => s + e.amount, 0), 500);
  });

  it('C5: Atomic onboardClinicTransaction creates /clinics, /users, and /members satisfying getAfter() rules', async () => {
    const ownerUser = await ensureAuthUser(appSession1, 'new-owner-e2e@medicore.test', 'TestPass123!');
    const ownerDb = getFirestore(appSession1);

    const newClinic = await onboardClinicTransaction(
      ownerUser.uid,
      {
        name: 'Riyadh Heart Clinic',
        nameAr: 'عيادة قلب الرياض',
        code: 'RHC',
        specialty: 'Cardiology',
        specialtyAr: 'القلب',
        phone: '+966500001111',
        email: 'contact@rhc.test',
        city: 'Riyadh',
        address: 'Olaya St',
        status: 'active',
        plan: 'free_spark',
        workingHours: { start: '09:00', end: '21:00', days: [0, 1, 2, 3, 4] },
        branches: [{ id: 'br-1', name: 'Main', nameAr: 'الرئيسي', city: 'Riyadh', address: 'Olaya St', phone: '+966500001111', isMain: true }],
      },
      { name: 'Dr. Omar Owner', email: 'new-owner-e2e@medicore.test', phone: '+966500001111' },
      ownerDb
    );

    const clinicSnap = await getDoc(doc(ownerDb, 'clinics', newClinic.id));
    const userSnap = await getDoc(doc(ownerDb, 'users', ownerUser.uid));
    const memberSnap = await getDoc(doc(ownerDb, 'clinics', newClinic.id, 'members', ownerUser.uid));
    assert.strictEqual(clinicSnap.data()?.ownerUid, ownerUser.uid);
    assert.strictEqual(userSnap.data()?.role, 'clinic_owner');
    assert.strictEqual(memberSnap.data()?.role, 'clinic_owner');
  });

  it('C6: Doctor persists lab orders to /labResults, rejects duplicates & unauthorized roles', async () => {
    const { docUid } = await seedClinicAndUsers();
    const recDb = getFirestore(appSession1);
    const docDb = getFirestore(appSession2);

    const createdLab = await createLabOrderRecord(
      'clinic-nokhba',
      {
        patientId: 'pat-a1',
        patientName: 'Salem Al-Harbi',
        doctorId: docUid,
        doctorName: 'E2E Doctor',
        testNames: ['Lipid Panel (Full)', 'Fasting Blood Glucose'],
        appointmentId: 'apt-lab-1',
      },
      { idempotencyKey: `e2e-lab-${docUid}-pat-a1` },
      docDb
    );

    assert.strictEqual(createdLab.status, 'ordered');
    assert.strictEqual(createdLab.tests.length, 2);

    const labSnap = await getDoc(doc(docDb, 'clinics/clinic-nokhba/labResults', createdLab.id));
    assert.strictEqual(labSnap.exists(), true);
    assert.strictEqual(labSnap.data()?.patientId, 'pat-a1');
    assert.strictEqual(labSnap.data()?.status, 'ordered');

    // Re-submitting with identical idempotencyKey or identical active order rejects duplicate
    await assert.rejects(
      createLabOrderRecord(
        'clinic-nokhba',
        {
          patientId: 'pat-a1',
          patientName: 'Salem Al-Harbi',
          doctorId: docUid,
          doctorName: 'E2E Doctor',
          testNames: ['Fasting Blood Glucose', 'Lipid Panel (Full)'],
        },
        { existingOrders: [createdLab] },
        docDb
      ),
      (err: unknown) => err instanceof DuplicateLabOrderError
    );

    // Receptionist is NOT isClinicalStaff -> rejected by Firestore rules
    await assert.rejects(
      createLabOrderRecord(
        'clinic-nokhba',
        {
          patientId: 'pat-a1',
          patientName: 'Salem Al-Harbi',
          doctorId: docUid,
          doctorName: 'E2E Doctor',
          testNames: ['Complete Blood Count (CBC)'],
        },
        { labOrderId: 'lab-rec-blocked' },
        recDb
      )
    );
  });
});
