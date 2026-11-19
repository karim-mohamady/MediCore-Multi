import {
  doc,
  collection,
  runTransaction,
  onSnapshot,
  query,
  where,
  orderBy,
  setDoc,
  getDocs,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebase';
import { buildTenantPath, buildSlotKey, assertValidDocumentId, TenantAccessError } from './tenant';
import {
  Appointment,
  Clinic,
  FinancialLedgerEntry,
  Invoice,
  LabOrder,
  LabOrderItem,
  Patient,
  Prescription,
  QueueTicket,
  UserProfile,
  UserRole,
  VitalSigns,
  AuditLog,
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export class ConcurrencyConflictError extends Error {
  constructor(message: string) {
    super(`[CONCURRENCY_CONFLICT] ${message}`);
    this.name = 'ConcurrencyConflictError';
  }
}

export class PaymentIntegrityError extends Error {
  constructor(message: string) {
    super(`[PAYMENT_INTEGRITY_VIOLATION] ${message}`);
    this.name = 'PaymentIntegrityError';
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(message: string) {
    super(`[INVALID_STATE_TRANSITION] ${message}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class DuplicateLabOrderError extends Error {
  constructor(message: string) {
    super(`[LAB_DUPLICATE_ORDER] ${message}`);
    this.name = 'DuplicateLabOrderError';
  }
}

function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

const VALID_APPOINTMENT_TRANSITIONS: Record<Appointment['status'], Appointment['status'][]> = {
  scheduled: ['confirmed', 'arrived', 'cancelled', 'rescheduled'],
  confirmed: ['arrived', 'cancelled', 'rescheduled'],
  arrived: ['in_consultation', 'cancelled'],
  in_consultation: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rescheduled: [],
};

const VALID_QUEUE_TRANSITIONS: Record<QueueTicket['status'], QueueTicket['status'][]> = {
  waiting: ['called', 'cancelled', 'skipped', 'no_show'],
  called: ['in_room', 'in_consultation', 'waiting', 'cancelled', 'skipped', 'no_show'],
  in_room: ['completed'],
  in_consultation: ['completed'],
  completed: [],
  no_show: [],
  cancelled: [],
  skipped: ['waiting'],
};

/**
 * Atomic Clinic Onboarding Transaction
 * Provisions /clinics/{clinicId}, /users/{ownerUid}, and /clinics/{clinicId}/members/{ownerUid}
 * in a single transaction matching firestore.rules getAfter() ownership guards.
 */
export async function onboardClinicTransaction(
  ownerUid: string,
  clinicData: Omit<Clinic, 'id' | 'createdAt' | 'ownerUid'>,
  ownerData: { name: string; email: string; phone: string },
  targetDb: Firestore = db
): Promise<Clinic> {
  assertValidDocumentId(ownerUid, 'ownerUid');
  const clinicId = `clinic-${Date.now()}`;
  assertValidDocumentId(clinicId, 'clinicId');

  const now = new Date().toISOString();
  const newClinic: Clinic = {
    ...clinicData,
    id: clinicId,
    ownerUid,
    status: 'active',
    createdAt: now,
  };

  if (!isFirebaseConfigured() && targetDb === db) {
    return newClinic;
  }

  const clinicPath = `clinics/${clinicId}`;
  try {
    await runTransaction(targetDb, async (transaction) => {
      const clinicRef = doc(targetDb, 'clinics', clinicId);
      const userRef = doc(targetDb, 'users', ownerUid);
      const memberRef = doc(targetDb, buildTenantPath(clinicId, 'members', ownerUid));

      // Do not read clinicRef prior to creation; firestore.rules `allow create` enforces !exists()
      transaction.set(clinicRef, newClinic);
      transaction.set(userRef, {
        id: ownerUid,
        clinicId,
        role: 'clinic_owner',
        status: 'active',
        name: ownerData.name,
        nameAr: ownerData.name,
        email: ownerData.email,
        phone: ownerData.phone,
        specialty: clinicData.specialty,
        specialtyAr: clinicData.specialtyAr,
        createdAt: now,
      });
      transaction.set(memberRef, {
        userId: ownerUid,
        clinicId,
        role: 'clinic_owner',
        active: true,
        name: ownerData.name,
        email: ownerData.email,
        phone: ownerData.phone,
        createdAt: now,
      });
    });

    return newClinic;
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) throw error;
    handleFirestoreError(error, OperationType.WRITE, clinicPath);
  }
}

/**
 * Patient Intake Record Creation
 */
export async function createPatientRecord(
  clinicId: string,
  patientData: Omit<Patient, 'id' | 'createdAt' | 'balance'>,
  options?: { patientId?: string },
  targetDb: Firestore = db
): Promise<Patient> {
  assertValidDocumentId(clinicId, 'clinicId');
  const patientId = options?.patientId || `pat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  assertValidDocumentId(patientId, 'patientId');

  const newPatient: Patient = {
    ...patientData,
    id: patientId,
    clinicId,
    balance: 0,
    createdAt: new Date().toISOString(),
  };

  if (!isFirebaseConfigured() && targetDb === db) {
    return newPatient;
  }

  const patientPath = buildTenantPath(clinicId, 'patients', patientId);
  try {
    await setDoc(doc(targetDb, patientPath), newPatient);
    return newPatient;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, patientPath);
  }
}

/**
 * Deterministic Slot Reservation & Concurrency Guard
 * Atomically locks /clinics/{clinicId}/appointmentSlots/{slotKey} and writes
 * /clinics/{clinicId}/appointments/{appointmentId}.
 * Allows rebooking if an existing deterministic slot lock has status === 'cancelled'.
 */
export async function bookAppointmentWithSlotTransaction(
  clinicId: string,
  appointmentData: Omit<Appointment, 'id' | 'createdAt'>,
  options?: { appointmentId?: string },
  targetDb: Firestore = db
): Promise<Appointment> {
  assertValidDocumentId(clinicId, 'clinicId');
  const slotKey = buildSlotKey(appointmentData.doctorId, appointmentData.date, appointmentData.timeSlot);
  const slotDocPath = buildTenantPath(clinicId, 'appointmentSlots', slotKey);
  const newAppointmentId = options?.appointmentId || `apt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  assertValidDocumentId(newAppointmentId, 'appointmentId');
  const aptDocPath = buildTenantPath(clinicId, 'appointments', newAppointmentId);

  const now = new Date().toISOString();
  const appointment: Appointment = {
    ...appointmentData,
    clinicId,
    id: newAppointmentId,
    createdAt: now,
  };

  if (!isFirebaseConfigured() && targetDb === db) {
    return appointment;
  }

  try {
    await runTransaction(targetDb, async (transaction) => {
      const slotRef = doc(targetDb, slotDocPath);
      const aptRef = doc(targetDb, aptDocPath);
      const slotSnap = await transaction.get(slotRef);

      if (slotSnap.exists()) {
        const existingData = slotSnap.data();
        if (existingData.status !== 'cancelled') {
          throw new ConcurrencyConflictError(
            `Doctor slot '${appointmentData.timeSlot}' on '${appointmentData.date}' is already reserved.`
          );
        }
        // Rebook previously cancelled deterministic slot
        transaction.update(slotRef, {
          status: 'reserved',
          patientId: appointmentData.patientId,
          appointmentId: newAppointmentId,
          updatedAt: now,
        });
      } else {
        transaction.set(slotRef, {
          id: slotKey,
          clinicId,
          doctorId: appointmentData.doctorId,
          patientId: appointmentData.patientId,
          date: appointmentData.date,
          timeSlot: appointmentData.timeSlot,
          status: 'reserved',
          appointmentId: newAppointmentId,
          createdAt: now,
        });
      }

      transaction.set(aptRef, {
        ...appointment,
        slotKey,
      });
    });

    return appointment;
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) throw error;
    handleFirestoreError(error, OperationType.WRITE, slotDocPath);
  }
}

/**
 * Appointment Cancellation & Slot Release
 * Atomically marks appointment cancelled and frees the deterministic reservation slot.
 */
export async function cancelAppointmentTransaction(
  clinicId: string,
  appointmentId: string,
  targetDb: Firestore = db
): Promise<void> {
  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(appointmentId, 'appointmentId');
  const aptDocPath = buildTenantPath(clinicId, 'appointments', appointmentId);

  if (!isFirebaseConfigured() && targetDb === db) return;

  try {
    await runTransaction(targetDb, async (transaction) => {
      const aptRef = doc(targetDb, aptDocPath);
      const aptSnap = await transaction.get(aptRef);

      if (!aptSnap.exists()) {
        throw new Error(`Appointment '${appointmentId}' does not exist.`);
      }

      const aptData = aptSnap.data() as Appointment & { slotKey?: string };
      if (aptData.status === 'completed' || aptData.status === 'cancelled') {
        throw new InvalidStateTransitionError(`Cannot cancel appointment in '${aptData.status}' state.`);
      }

      const slotKey = aptData.slotKey || buildSlotKey(aptData.doctorId, aptData.date, aptData.timeSlot);
      const slotRef = doc(targetDb, buildTenantPath(clinicId, 'appointmentSlots', slotKey));
      const slotSnap = await transaction.get(slotRef);

      const now = new Date().toISOString();
      transaction.update(aptRef, {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
      });

      if (slotSnap.exists() && slotSnap.data().status === 'reserved') {
        transaction.update(slotRef, {
          status: 'cancelled',
          updatedAt: now,
        });
      }
    });
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, aptDocPath);
  }
}

/**
 * Reschedule Appointment & Atomically Reassign Slot Lock
 */
export async function rescheduleAppointmentTransaction(
  clinicId: string,
  appointmentId: string,
  newDate: string,
  newTimeSlot: string,
  targetDb: Firestore = db
): Promise<void> {
  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(appointmentId, 'appointmentId');
  const aptDocPath = buildTenantPath(clinicId, 'appointments', appointmentId);

  if (!isFirebaseConfigured() && targetDb === db) return;

  try {
    await runTransaction(targetDb, async (transaction) => {
      const aptRef = doc(targetDb, aptDocPath);
      const aptSnap = await transaction.get(aptRef);

      if (!aptSnap.exists()) {
        throw new Error(`Appointment '${appointmentId}' does not exist.`);
      }

      const aptData = aptSnap.data() as Appointment & { slotKey?: string };
      if (aptData.status !== 'scheduled' && aptData.status !== 'confirmed') {
        throw new InvalidStateTransitionError(`Cannot reschedule appointment in '${aptData.status}' state.`);
      }

      const oldSlotKey = aptData.slotKey || buildSlotKey(aptData.doctorId, aptData.date, aptData.timeSlot);
      const newSlotKey = buildSlotKey(aptData.doctorId, newDate, newTimeSlot);
      const oldSlotRef = doc(targetDb, buildTenantPath(clinicId, 'appointmentSlots', oldSlotKey));
      const newSlotRef = doc(targetDb, buildTenantPath(clinicId, 'appointmentSlots', newSlotKey));

      const oldSlotSnap = await transaction.get(oldSlotRef);
      const newSlotSnap = oldSlotKey === newSlotKey ? oldSlotSnap : await transaction.get(newSlotRef);

      if (newSlotKey !== oldSlotKey && newSlotSnap.exists() && newSlotSnap.data().status !== 'cancelled') {
        throw new ConcurrencyConflictError(`Target slot '${newTimeSlot}' on '${newDate}' is already reserved.`);
      }

      const now = new Date().toISOString();
      if (oldSlotKey !== newSlotKey && oldSlotSnap.exists() && oldSlotSnap.data().status === 'reserved') {
        transaction.update(oldSlotRef, { status: 'cancelled', updatedAt: now });
      }

      if (newSlotKey !== oldSlotKey) {
        if (newSlotSnap.exists()) {
          transaction.update(newSlotRef, {
            status: 'reserved',
            patientId: aptData.patientId,
            appointmentId,
            updatedAt: now,
          });
        } else {
          transaction.set(newSlotRef, {
            id: newSlotKey,
            clinicId,
            doctorId: aptData.doctorId,
            patientId: aptData.patientId,
            date: newDate,
            timeSlot: newTimeSlot,
            status: 'reserved',
            appointmentId,
            createdAt: now,
          });
        }
      }

      transaction.update(aptRef, {
        date: newDate,
        timeSlot: newTimeSlot,
        status: aptData.status,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError || error instanceof InvalidStateTransitionError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, aptDocPath);
  }
}

/**
 * Appointment Lifecycle Transition Guard
 */
export async function updateAppointmentStatusTransaction(
  clinicId: string,
  appointmentId: string,
  nextStatus: Appointment['status'],
  targetDb: Firestore = db
): Promise<void> {
  if (nextStatus === 'cancelled') {
    return cancelAppointmentTransaction(clinicId, appointmentId, targetDb);
  }

  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(appointmentId, 'appointmentId');
  const aptDocPath = buildTenantPath(clinicId, 'appointments', appointmentId);

  if (!isFirebaseConfigured() && targetDb === db) return;

  try {
    await runTransaction(targetDb, async (transaction) => {
      const aptRef = doc(targetDb, aptDocPath);
      const aptSnap = await transaction.get(aptRef);
      if (!aptSnap.exists()) {
        throw new Error(`Appointment '${appointmentId}' does not exist.`);
      }

      const aptData = aptSnap.data() as Appointment;
      const allowed = VALID_APPOINTMENT_TRANSITIONS[aptData.status] || [];
      if (aptData.status !== nextStatus && !allowed.includes(nextStatus)) {
        throw new InvalidStateTransitionError(
          `Invalid appointment transition from '${aptData.status}' to '${nextStatus}'.`
        );
      }

      transaction.update(aptRef, {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, aptDocPath);
  }
}

/**
 * Check-In Patient: Atomically transitions Appointment -> 'arrived' and creates QueueTicket in /queues
 */
export async function checkInPatientTransaction(
  clinicId: string,
  appointmentId: string,
  tokenNumber: string,
  estimatedWaitMin: number,
  priority: 'normal' | 'urgent' = 'normal',
  targetDb: Firestore = db
): Promise<QueueTicket> {
  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(appointmentId, 'appointmentId');

  const ticketId = `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  assertValidDocumentId(ticketId, 'ticketId');
  const aptDocPath = buildTenantPath(clinicId, 'appointments', appointmentId);
  const queueDocPath = buildTenantPath(clinicId, 'queues', ticketId);

  let createdTicket!: QueueTicket;

  if (!isFirebaseConfigured() && targetDb === db) {
    throw new Error('Firebase is not configured for live check-in.');
  }

  try {
    await runTransaction(targetDb, async (transaction) => {
      const aptRef = doc(targetDb, aptDocPath);
      const aptSnap = await transaction.get(aptRef);
      if (!aptSnap.exists()) {
        throw new Error(`Appointment '${appointmentId}' not found.`);
      }

      const apt = aptSnap.data() as Appointment;
      if (apt.status !== 'scheduled' && apt.status !== 'confirmed') {
        throw new InvalidStateTransitionError(`Cannot check in appointment with status '${apt.status}'.`);
      }

      const now = new Date().toISOString();
      createdTicket = {
        id: ticketId,
        clinicId,
        branchId: apt.branchId,
        appointmentId: apt.id,
        patientId: apt.patientId,
        patientName: apt.patientName,
        patientPhone: apt.patientPhone,
        doctorId: apt.doctorId,
        doctorName: apt.doctorName,
        tokenNumber,
        status: 'waiting',
        estimatedWaitMin,
        createdAt: now,
        priority,
      };

      transaction.set(doc(targetDb, queueDocPath), createdTicket);
      transaction.update(aptRef, {
        status: 'arrived',
        queueToken: tokenNumber,
        updatedAt: now,
      });
    });

    return createdTicket;
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) throw error;
    handleFirestoreError(error, OperationType.WRITE, queueDocPath);
  }
}

/**
 * Update Queue Ticket Status & Sync Linked Appointment Lifecycle Atomically
 */
export async function updateQueueTicketStatusTransaction(
  clinicId: string,
  ticketId: string,
  nextStatus: QueueTicket['status'],
  targetDb: Firestore = db
): Promise<void> {
  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(ticketId, 'ticketId');
  const queueDocPath = buildTenantPath(clinicId, 'queues', ticketId);

  if (!isFirebaseConfigured() && targetDb === db) return;

  try {
    await runTransaction(targetDb, async (transaction) => {
      const ticketRef = doc(targetDb, queueDocPath);
      const ticketSnap = await transaction.get(ticketRef);
      if (!ticketSnap.exists()) {
        throw new Error(`Queue ticket '${ticketId}' not found.`);
      }

      const ticket = ticketSnap.data() as QueueTicket;
      const allowed = VALID_QUEUE_TRANSITIONS[ticket.status] || [];
      if (!allowed.includes(nextStatus)) {
        throw new InvalidStateTransitionError(`Invalid queue transition from '${ticket.status}' to '${nextStatus}'.`);
      }

      const aptRef = ticket.appointmentId
        ? doc(targetDb, buildTenantPath(clinicId, 'appointments', ticket.appointmentId))
        : null;
      const aptSnap = aptRef ? await transaction.get(aptRef) : null;

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: now,
      };
      if (nextStatus === 'called') {
        updates.calledAt = now;
        updates.estimatedWaitMin = 0;
      } else if (nextStatus === 'in_room' || nextStatus === 'in_consultation') {
        updates.startedAt = now;
      } else if (nextStatus === 'completed') {
        updates.completedAt = now;
      }

      transaction.update(ticketRef, updates);

      if (aptRef && aptSnap && aptSnap.exists()) {
        const aptStatus = (aptSnap.data() as Appointment).status;
        if ((nextStatus === 'in_room' || nextStatus === 'in_consultation') && aptStatus === 'arrived') {
          transaction.update(aptRef, { status: 'in_consultation', updatedAt: now });
        } else if (nextStatus === 'completed' && aptStatus === 'in_consultation') {
          transaction.update(aptRef, { status: 'completed', updatedAt: now });
        }
      }
    });
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, queueDocPath);
  }
}

/**
 * Record Patient Vitals inside PHI-Protected /patientClinicalRecords/{patientId}
 */
export async function recordPatientVitals(
  clinicId: string,
  patientId: string,
  vitalsData: VitalSigns,
  targetDb: Firestore = db
): Promise<void> {
  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(patientId, 'patientId');
  const recordPath = buildTenantPath(clinicId, 'patientClinicalRecords', patientId);

  if (!isFirebaseConfigured() && targetDb === db) return;

  try {
    await setDoc(
      doc(targetDb, recordPath),
      {
        clinicId,
        patientId,
        vitals: vitalsData,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, recordPath);
  }
}

/**
 * Finalize Doctor Consultation & Prescription Atomically
 */
export async function savePrescriptionTransaction(
  clinicId: string,
  rxData: Omit<Prescription, 'id' | 'clinicId'>,
  options?: { queueTicketId?: string; clinicalNotes?: string },
  targetDb: Firestore = db
): Promise<Prescription> {
  assertValidDocumentId(clinicId, 'clinicId');
  const rxId = `rx-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const consultId = `con-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  assertValidDocumentId(rxId, 'rxId');
  assertValidDocumentId(consultId, 'consultId');

  const now = new Date().toISOString();
  const newRx: Prescription = {
    ...rxData,
    id: rxId,
    clinicId,
    status: 'finalized',
  };

  if (!isFirebaseConfigured() && targetDb === db) {
    return newRx;
  }

  const rxPath = buildTenantPath(clinicId, 'prescriptions', rxId);
  try {
    await runTransaction(targetDb, async (transaction) => {
      let ticketSnap = null;
      let aptSnap = null;
      const ticketRef = options?.queueTicketId
        ? doc(targetDb, buildTenantPath(clinicId, 'queues', options.queueTicketId))
        : null;
      const aptRef = rxData.appointmentId
        ? doc(targetDb, buildTenantPath(clinicId, 'appointments', rxData.appointmentId))
        : null;

      if (ticketRef) ticketSnap = await transaction.get(ticketRef);
      if (aptRef) aptSnap = await transaction.get(aptRef);

      transaction.set(doc(targetDb, rxPath), newRx);
      transaction.set(doc(targetDb, buildTenantPath(clinicId, 'consultations', consultId)), {
        id: consultId,
        clinicId,
        patientId: rxData.patientId,
        doctorId: rxData.doctorId,
        appointmentId: rxData.appointmentId,
        diagnosis: rxData.diagnosis,
        notes: options?.clinicalNotes || rxData.notes || '',
        status: 'finalized',
        finalizedAt: now,
        createdAt: now,
      });

      if (ticketRef && ticketSnap && ticketSnap.exists()) {
        const qStatus = (ticketSnap.data() as QueueTicket).status;
        if (qStatus === 'in_room' || qStatus === 'in_consultation') {
          transaction.update(ticketRef, { status: 'completed', completedAt: now, updatedAt: now });
        }
      }
      if (aptRef && aptSnap && aptSnap.exists()) {
        const aStatus = (aptSnap.data() as Appointment).status;
        if (aStatus === 'in_consultation') {
          transaction.update(aptRef, { status: 'completed', updatedAt: now });
        }
      }
    });

    return newRx;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, rxPath);
  }
}

export const LAB_TEST_CATALOG: Readonly<
  Record<string, { testNameAr: string; unit: string; referenceRange: string; category: LabOrder['category'] }>
> = {
  'Complete Blood Count (CBC)': {
    testNameAr: 'تعداد الدم الكامل (CBC)',
    unit: '10^9/L',
    referenceRange: '4.5 - 11.0',
    category: 'hematology',
  },
  'Fasting Blood Glucose': {
    testNameAr: 'سكر الدم الصائم',
    unit: 'mg/dL',
    referenceRange: '70 - 99',
    category: 'biochemistry',
  },
  'HbA1c Glycated Hemoglobin': {
    testNameAr: 'السكر التراكمي (HbA1c)',
    unit: '%',
    referenceRange: '4.0 - 5.6',
    category: 'biochemistry',
  },
  'Lipid Panel (Full)': {
    testNameAr: 'ملف الدهون الكامل',
    unit: 'mg/dL',
    referenceRange: '< 200',
    category: 'biochemistry',
  },
  'Liver Function Tests (LFT)': {
    testNameAr: 'وظائف الكبد',
    unit: 'U/L',
    referenceRange: '7 - 56',
    category: 'biochemistry',
  },
  'Serum Creatinine & Urea': {
    testNameAr: 'وظائف الكلى والكرياتينين',
    unit: 'mg/dL',
    referenceRange: '0.7 - 1.3',
    category: 'biochemistry',
  },
};

export function normalizeLabTestNames(testNames: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of testNames) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(trimmed);
    }
  }
  return cleaned;
}

export function buildLabOrderSignature(patientId: string, testNames: string[]): string {
  const normalized = normalizeLabTestNames(testNames)
    .map((n) => n.toLowerCase())
    .sort();
  return `${patientId}::${normalized.join('|')}`;
}

export function buildLabOrderItems(testNames: string[]): LabOrderItem[] {
  return normalizeLabTestNames(testNames).map((name) => {
    const meta = LAB_TEST_CATALOG[name];
    return {
      testName: name,
      testNameAr: meta?.testNameAr || name,
      unit: meta?.unit || 'U',
      referenceRange: meta?.referenceRange || 'Standard',
    };
  });
}

/**
 * Create Laboratory Order Record under /clinics/{clinicId}/labResults/{labOrderId}
 * Enforces:
 * - Valid tenant, patient, and doctor IDs
 * - Non-empty deduplicated tests array
 * - Active duplicate order protection (for same patient + exact test set)
 * - Transactional idempotent creation with status 'ordered' (compatible with firestore.rules)
 */
export async function createLabOrderRecord(
  clinicId: string,
  orderData: {
    patientId: string;
    patientName: string;
    doctorId: string;
    doctorName: string;
    testNames: string[];
    appointmentId?: string;
    category?: LabOrder['category'];
  },
  options?: {
    labOrderId?: string;
    idempotencyKey?: string;
    existingOrders?: LabOrder[];
  },
  targetDb: Firestore = db
): Promise<LabOrder> {
  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(orderData.patientId, 'patientId');
  assertValidDocumentId(orderData.doctorId, 'doctorId');

  const uniqueTests = normalizeLabTestNames(orderData.testNames);
  if (uniqueTests.length === 0) {
    throw new Error('At least one laboratory test must be selected before submitting an order.');
  }

  const signature = buildLabOrderSignature(orderData.patientId, uniqueTests);
  const activeStatuses: LabOrder['status'][] = ['pending', 'ordered', 'sample_taken'];
  if (options?.existingOrders) {
    const duplicate = options.existingOrders.find(
      (existing) =>
        existing.clinicId === clinicId &&
        existing.patientId === orderData.patientId &&
        activeStatuses.includes(existing.status) &&
        buildLabOrderSignature(existing.patientId, existing.tests.map((t) => t.testName)) === signature
    );
    if (duplicate) {
      throw new DuplicateLabOrderError(
        `An active laboratory order with the exact selected tests already exists for ${orderData.patientName} (${duplicate.id}).`
      );
    }
  }

  const rawId =
    options?.labOrderId ||
    (options?.idempotencyKey
      ? `lab-${options.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : `lab-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  assertValidDocumentId(rawId, 'labOrderId');

  const inferredCategory: LabOrder['category'] =
    orderData.category ||
    LAB_TEST_CATALOG[uniqueTests[0]]?.category ||
    'biochemistry';

  const now = new Date().toISOString();
  const newOrder: LabOrder = {
    id: rawId,
    clinicId,
    patientId: orderData.patientId,
    patientName: orderData.patientName,
    doctorId: orderData.doctorId,
    doctorName: orderData.doctorName,
    ...(orderData.appointmentId ? { appointmentId: orderData.appointmentId } : {}),
    category: inferredCategory,
    tests: buildLabOrderItems(uniqueTests),
    status: 'ordered',
    orderedAt: now,
    orderSignature: signature,
  };

  if (!isFirebaseConfigured() && targetDb === db) {
    return newOrder;
  }

  const labPath = buildTenantPath(clinicId, 'labResults', rawId);
  try {
    await runTransaction(targetDb, async (transaction) => {
      const labRef = doc(targetDb, labPath);
      const existingSnap = await transaction.get(labRef);
      if (existingSnap.exists()) {
        throw new DuplicateLabOrderError(
          `Laboratory order '${rawId}' has already been submitted.`
        );
      }
      transaction.set(labRef, newOrder);
    });
    return newOrder;
  } catch (error) {
    if (error instanceof DuplicateLabOrderError) throw error;
    handleFirestoreError(error, OperationType.CREATE, labPath);
  }
}

/**
 * Create Invoice Record (Starts unpaid with paidAmount == 0 as enforced by firestore.rules)
 */
export async function createInvoiceRecord(
  clinicId: string,
  invoiceData: Omit<Invoice, 'id' | 'clinicId' | 'invoiceNumber' | 'paidAmount' | 'paymentStatus' | 'remainingAmount'>,
  invoiceNumber: string,
  options?: { invoiceId?: string },
  targetDb: Firestore = db
): Promise<Invoice> {
  assertValidDocumentId(clinicId, 'clinicId');
  const invoiceId = options?.invoiceId || `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  assertValidDocumentId(invoiceId, 'invoiceId');

  const cleanTotal = roundCurrency(invoiceData.totalAmount);
  const newInvoice: Invoice = {
    patientId: invoiceData.patientId,
    patientName: invoiceData.patientName,
    date: invoiceData.date,
    items: invoiceData.items,
    subtotal: invoiceData.subtotal,
    tax: invoiceData.tax,
    discount: invoiceData.discount,
    paymentMethod: invoiceData.paymentMethod,
    ...(invoiceData.appointmentId ? { appointmentId: invoiceData.appointmentId } : {}),
    ...(invoiceData.notes ? { notes: invoiceData.notes } : {}),
    id: invoiceId,
    clinicId,
    invoiceNumber,
    totalAmount: cleanTotal,
    paidAmount: 0,
    remainingAmount: cleanTotal,
    paymentStatus: 'unpaid',
  };

  if (!isFirebaseConfigured() && targetDb === db) {
    return newInvoice;
  }

  const invoicePath = buildTenantPath(clinicId, 'invoices', invoiceId);
  try {
    await setDoc(doc(targetDb, invoicePath), newInvoice);
    return newInvoice;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, invoicePath);
  }
}

/**
 * Atomic Payment Collection & Immutable Ledger Transaction
 * Enforces:
 * 1. Idempotency via deterministic paymentId / idempotencyKey
 * 2. No overpayment beyond remaining balance
 * 3. Immutable subcollection write: /clinics/{clinicId}/invoices/{invoiceId}/payments/{paymentId}
 * 4. Atomic invoice balance, remainingAmount, and status transition satisfying firestore.rules getAfter()
 */
export async function recordPaymentTransaction(
  clinicId: string,
  invoiceId: string,
  paymentData: {
    amount: number;
    paymentMethod: 'cash' | 'card' | 'insurance';
    cashierName: string;
    patientName: string;
    notes?: string;
    idempotencyKey?: string;
  },
  targetDb: Firestore = db
): Promise<{ invoice: Partial<Invoice>; ledgerEntry: FinancialLedgerEntry; idempotentReplay?: boolean }> {
  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(invoiceId, 'invoiceId');

  const paymentAmount = roundCurrency(paymentData.amount);
  if (paymentAmount <= 0 || !Number.isFinite(paymentAmount)) {
    throw new PaymentIntegrityError('Payment amount must be a positive finite number.');
  }

  const invoiceDocPath = buildTenantPath(clinicId, 'invoices', invoiceId);
  const paymentId = paymentData.idempotencyKey
    ? paymentData.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')
    : `pmt-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  assertValidDocumentId(paymentId, 'paymentId');

  const receiptNumber = `RCP-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  let updatedInvoice: Partial<Invoice> = {};
  let idempotentReplay = false;
  let ledgerEntry: FinancialLedgerEntry = {
    id: paymentId,
    clinicId,
    invoiceId,
    receiptNumber,
    timestamp: now,
    type: 'payment',
    amount: paymentAmount,
    paymentMethod: paymentData.paymentMethod,
    cashierName: paymentData.cashierName,
    patientName: paymentData.patientName,
  };

  if (!isFirebaseConfigured() && targetDb === db) {
    return { invoice: updatedInvoice, ledgerEntry };
  }

  try {
    await runTransaction(targetDb, async (transaction) => {
      const invoiceRef = doc(targetDb, invoiceDocPath);
      const paymentRef = doc(targetDb, `${invoiceDocPath}/payments`, paymentId);

      const invoiceSnap = await transaction.get(invoiceRef);
      const paymentSnap = await transaction.get(paymentRef);

      if (paymentSnap.exists()) {
        // Idempotent retry: return existing payment without double-charging
        idempotentReplay = true;
        const existingPmt = paymentSnap.data();
        const existingInv = invoiceSnap.exists() ? (invoiceSnap.data() as Invoice) : undefined;
        ledgerEntry = {
          id: paymentId,
          clinicId,
          invoiceId,
          receiptNumber: existingPmt.receiptNumber || receiptNumber,
          timestamp: existingPmt.timestamp || now,
          type: 'payment',
          amount: existingPmt.amount,
          paymentMethod: existingPmt.paymentMethod,
          cashierName: existingPmt.cashierName,
          patientName: existingPmt.patientName || paymentData.patientName,
        };
        updatedInvoice = existingInv
          ? {
              paidAmount: existingInv.paidAmount,
              remainingAmount: existingInv.remainingAmount,
              paymentStatus: existingInv.paymentStatus,
            }
          : {};
        return;
      }

      if (!invoiceSnap.exists()) {
        throw new PaymentIntegrityError(`Invoice '${invoiceId}' was not found in clinic '${clinicId}'.`);
      }

      const invoice = invoiceSnap.data() as Invoice;

      if (invoice.paymentStatus === 'paid') {
        throw new PaymentIntegrityError('Invoice is already fully settled. No additional payments allowed.');
      }

      const currentPaid = roundCurrency(invoice.paidAmount || 0);
      const remainingBalance = roundCurrency(invoice.totalAmount - currentPaid);

      if (paymentAmount > remainingBalance) {
        throw new PaymentIntegrityError(
          `Overpayment rejected: Attempted to pay ${paymentAmount} SAR but outstanding balance is only ${remainingBalance} SAR.`
        );
      }

      const newPaidAmount = roundCurrency(currentPaid + paymentAmount);
      const newRemainingAmount = roundCurrency(invoice.totalAmount - newPaidAmount);
      const newStatus: Invoice['paymentStatus'] =
        newRemainingAmount <= 0 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid';

      // 1. Immutable write to payments subcollection (includes clinicId for validTenantOnCreate)
      transaction.set(paymentRef, {
        paymentId,
        clinicId,
        invoiceId,
        receiptNumber,
        amount: paymentAmount,
        paymentMethod: paymentData.paymentMethod,
        cashierName: paymentData.cashierName,
        patientName: paymentData.patientName,
        timestamp: now,
        notes: paymentData.notes || '',
      });

      // 2. Atomic invoice balance and status update (coupled 1:1 with paymentId)
      transaction.update(invoiceRef, {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        paymentStatus: newStatus,
        paymentMethod: paymentData.paymentMethod,
        lastPaymentId: paymentId,
        updatedAt: now,
      });

      updatedInvoice = {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        paymentStatus: newStatus,
      };
    });

    return { invoice: updatedInvoice, ledgerEntry, idempotentReplay };
  } catch (error) {
    if (error instanceof PaymentIntegrityError) throw error;
    handleFirestoreError(error, OperationType.WRITE, invoiceDocPath);
  }
}

/**
 * Append Immutable Audit Log
 */
export async function writeAuditLog(
  clinicId: string,
  entry: Omit<AuditLog, 'id' | 'clinicId' | 'timestamp'>,
  targetDb: Firestore = db
): Promise<void> {
  assertValidDocumentId(clinicId, 'clinicId');
  const logId = `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const logPath = buildTenantPath(clinicId, 'auditLogs', logId);
  if (!isFirebaseConfigured() && targetDb === db) return;

  try {
    await setDoc(doc(targetDb, logPath), {
      ...entry,
      id: logId,
      clinicId,
      actorUid: auth?.currentUser?.uid || entry.userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Audit log write failed:', error);
  }
}

/**
 * Patient Account Linking & Enrollment Validation
 */
export async function linkPatientAccountToUser(
  clinicId: string,
  userId: string,
  patientData: { nationalId: string; fileNumber: string; name: string; phone: string },
  targetDb: Firestore = db
): Promise<void> {
  assertValidDocumentId(clinicId, 'clinicId');
  assertValidDocumentId(userId, 'userId');
  const patientPath = buildTenantPath(clinicId, 'patients', userId);
  const userPath = `users/${userId}`;

  if (!isFirebaseConfigured() && targetDb === db) return;

  try {
    await runTransaction(targetDb, async (transaction) => {
      const userRef = doc(targetDb, userPath);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) {
        throw new Error('User document not found for account linking.');
      }

      const userData = userSnap.data();
      if (userData.clinicId && userData.clinicId !== clinicId) {
        throw new TenantAccessError('Patient is already bound to a different clinic workspace.');
      }

      const patientRef = doc(targetDb, patientPath);
      transaction.set(patientRef, {
        id: userId,
        clinicId,
        userId,
        ...patientData,
        createdAt: new Date().toISOString(),
      });

      transaction.update(userRef, {
        role: 'patient',
        clinicId,
        patientId: userId,
        updatedAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    if (error instanceof TenantAccessError) throw error;
    handleFirestoreError(error, OperationType.WRITE, patientPath);
  }
}

// -----------------------------------------------------------------------------
// Real-Time Firestore Subscriptions
// -----------------------------------------------------------------------------

export function subscribeClinicDoc(
  clinicId: string,
  onUpdate: (clinic: Clinic | null) => void,
  onError?: (error: Error) => void,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const path = `clinics/${clinicId}`;
  return onSnapshot(
    doc(targetDb, 'clinics', clinicId),
    (snap) => {
      onUpdate(snap.exists() ? ({ id: snap.id, ...snap.data() } as Clinic) : null);
    },
    (err) => {
      onError?.(err);
      console.error('Clinic subscription error:', path, err);
    }
  );
}

export function subscribeAllClinics(
  onUpdate: (clinics: Clinic[]) => void,
  onError?: (error: Error) => void,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  return onSnapshot(
    collection(targetDb, 'clinics'),
    (snap) => {
      const list: Clinic[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Clinic, 'id'>) }));
      onUpdate(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribeClinicUsers(
  clinicId: string,
  onUpdate: (users: UserProfile[]) => void,
  onError?: (error: Error) => void,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const q = query(collection(targetDb, 'users'), where('clinicId', '==', clinicId));
  return onSnapshot(
    q,
    (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<UserProfile, 'id'>) }));
      onUpdate(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribeClinicPractitioners(
  clinicId: string,
  onUpdate: (users: UserProfile[]) => void,
  onError?: (error: Error) => void,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const q = query(
    collection(targetDb, 'users'),
    where('clinicId', '==', clinicId),
    where('role', 'in', ['doctor', 'clinic_owner'])
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<UserProfile, 'id'>) }));
      onUpdate(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribeClinicPatients(
  clinicId: string,
  onUpdate: (patients: Patient[]) => void,
  onError?: (error: Error) => void,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const path = buildTenantPath(clinicId, 'patients');
  return onSnapshot(
    collection(targetDb, path),
    (snap) => {
      const list: Patient[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Patient, 'id'>) }));
      onUpdate(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribeSinglePatient(
  clinicId: string,
  patientId: string,
  onUpdate: (patients: Patient[]) => void,
  onError?: (error: Error) => void,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const path = buildTenantPath(clinicId, 'patients', patientId);
  return onSnapshot(
    doc(targetDb, path),
    (snap) => {
      onUpdate(snap.exists() ? [{ id: snap.id, ...(snap.data() as Omit<Patient, 'id'>) }] : []);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribeClinicAppointments(
  clinicId: string,
  onUpdate: (appointments: Appointment[]) => void,
  onError?: (error: Error) => void,
  patientScopedId?: string,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const path = buildTenantPath(clinicId, 'appointments');
  const ref = collection(targetDb, path);
  const q = patientScopedId ? query(ref, where('patientId', '==', patientScopedId)) : ref;
  return onSnapshot(
    q,
    (snap) => {
      const list: Appointment[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }));
      onUpdate(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

/**
 * Live Waiting Queue Real-Time Synchronization Listener (/clinics/{clinicId}/queues)
 */
export function subscribeClinicQueue(
  clinicId: string,
  onUpdate: (tickets: QueueTicket[]) => void,
  onError?: (error: Error) => void,
  patientScopedId?: string,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) {
    return () => {};
  }

  const queueCollectionPath = buildTenantPath(clinicId, 'queues');
  const q = patientScopedId
    ? query(collection(targetDb, queueCollectionPath), where('patientId', '==', patientScopedId))
    : query(collection(targetDb, queueCollectionPath), orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const tickets: QueueTicket[] = [];
      snapshot.forEach((docSnap) => {
        tickets.push({ id: docSnap.id, ...(docSnap.data() as Omit<QueueTicket, 'id'>) });
      });
      tickets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onUpdate(tickets);
    },
    (error) => {
      console.error('Queue subscription error:', error);
      onError?.(error);
    }
  );
}

export function subscribeClinicVitals(
  clinicId: string,
  onUpdate: (vitalsMap: Record<string, VitalSigns>) => void,
  onError?: (error: Error) => void,
  patientScopedId?: string,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  if (patientScopedId) {
    const ref = doc(targetDb, buildTenantPath(clinicId, 'patientClinicalRecords', patientScopedId));
    return onSnapshot(
      ref,
      (snap) => {
        const map: Record<string, VitalSigns> = {};
        if (snap.exists() && snap.data().vitals) {
          map[snap.id] = snap.data().vitals as VitalSigns;
        }
        onUpdate(map);
      },
      (err) => onError?.(err)
    );
  }
  const path = buildTenantPath(clinicId, 'patientClinicalRecords');
  return onSnapshot(
    collection(targetDb, path),
    (snap) => {
      const map: Record<string, VitalSigns> = {};
      snap.forEach((d) => {
        if (d.data().vitals) map[d.id] = d.data().vitals as VitalSigns;
      });
      onUpdate(map);
    },
    (err) => onError?.(err)
  );
}

export function subscribeClinicPrescriptions(
  clinicId: string,
  onUpdate: (prescriptions: Prescription[]) => void,
  onError?: (error: Error) => void,
  patientScopedId?: string,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const path = buildTenantPath(clinicId, 'prescriptions');
  const ref = collection(targetDb, path);
  const q = patientScopedId
    ? query(ref, where('patientId', '==', patientScopedId), where('status', '==', 'finalized'))
    : ref;
  return onSnapshot(
    q,
    (snap) => {
      const list: Prescription[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Prescription, 'id'>) }));
      onUpdate(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeClinicLabs(
  clinicId: string,
  onUpdate: (labs: LabOrder[]) => void,
  onError?: (error: Error) => void,
  patientScopedId?: string,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const path = buildTenantPath(clinicId, 'labResults');
  const ref = collection(targetDb, path);
  const q = patientScopedId ? query(ref, where('patientId', '==', patientScopedId), where('status', '==', 'approved')) : ref;
  return onSnapshot(
    q,
    (snap) => {
      const list: LabOrder[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<LabOrder, 'id'>) }));
      onUpdate(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeClinicInvoices(
  clinicId: string,
  onUpdate: (invoices: Invoice[]) => void,
  onError?: (error: Error) => void,
  patientScopedId?: string,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const path = buildTenantPath(clinicId, 'invoices');
  const ref = collection(targetDb, path);
  const q = patientScopedId ? query(ref, where('patientId', '==', patientScopedId)) : ref;
  return onSnapshot(
    q,
    (snap) => {
      const list: Invoice[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Invoice, 'id'>) }));
      onUpdate(list);
    },
    (err) => onError?.(err)
  );
}

export async function fetchClinicPaymentsForInvoices(
  clinicId: string,
  invoiceIds: string[],
  targetDb: Firestore = db
): Promise<FinancialLedgerEntry[]> {
  if (!isFirebaseConfigured() && targetDb === db) return [];
  const entries: FinancialLedgerEntry[] = [];
  await Promise.all(
    invoiceIds.map(async (invoiceId) => {
      const snap = await getDocs(collection(targetDb, `${buildTenantPath(clinicId, 'invoices', invoiceId)}/payments`));
      snap.forEach((d) => {
        const data = d.data();
        entries.push({
          id: d.id,
          clinicId,
          invoiceId,
          receiptNumber: data.receiptNumber || d.id,
          timestamp: data.timestamp || new Date().toISOString(),
          type: 'payment',
          amount: data.amount || 0,
          paymentMethod: data.paymentMethod || 'card',
          cashierName: data.cashierName || '',
          patientName: data.patientName || '',
        });
      });
    })
  );
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return entries;
}

export function subscribeClinicAuditLogs(
  clinicId: string,
  onUpdate: (logs: AuditLog[]) => void,
  onError?: (error: Error) => void,
  targetDb: Firestore = db
): Unsubscribe {
  if (!isFirebaseConfigured() && targetDb === db) return () => {};
  const path = buildTenantPath(clinicId, 'auditLogs');
  return onSnapshot(
    query(collection(targetDb, path), orderBy('timestamp', 'desc')),
    (snap) => {
      const list: AuditLog[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }));
      onUpdate(list);
    },
    (err) => onError?.(err)
  );
}

