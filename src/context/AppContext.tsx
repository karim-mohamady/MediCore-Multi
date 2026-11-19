import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import {
  Clinic,
  UserProfile,
  UserRole,
  Patient,
  Appointment,
  QueueTicket,
  VitalSigns,
  Prescription,
  LabOrder,
  Invoice,
  FinancialLedgerEntry,
  AuditLog,
  Language,
  Theme,
} from '../types';
import {
  INITIAL_CLINICS,
  INITIAL_USERS,
  INITIAL_PATIENTS,
  INITIAL_APPOINTMENTS,
  INITIAL_QUEUES,
  INITIAL_VITALS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_LABS,
  INITIAL_INVOICES,
  INITIAL_LEDGER,
  INITIAL_AUDIT_LOGS,
} from '../data/mockData';
import { translations } from '../i18n/translations';
import { envEvaluation, isFirebaseConfigured, testConnection } from '../lib/firebase';
import { shouldDefaultToDemoMode } from '../lib/firebaseEnv';
import { onAuthStateChanged, signIn as authSignIn, signOut as authSignOut } from '../lib/auth';
import { hasRolePermission, checkRolePermission } from '../lib/permissions';
import {
  onboardClinicTransaction,
  createPatientRecord,
  bookAppointmentWithSlotTransaction,
  cancelAppointmentTransaction,
  rescheduleAppointmentTransaction,
  updateAppointmentStatusTransaction,
  checkInPatientTransaction,
  updateQueueTicketStatusTransaction,
  recordPatientVitals,
  savePrescriptionTransaction,
  createLabOrderRecord,
  buildLabOrderItems,
  buildLabOrderSignature,
  normalizeLabTestNames,
  LAB_TEST_CATALOG,
  DuplicateLabOrderError,
  createInvoiceRecord,
  recordPaymentTransaction,
  writeAuditLog,
  subscribeClinicDoc,
  subscribeAllClinics,
  subscribeClinicUsers,
  subscribeClinicPractitioners,
  subscribeClinicPatients,
  subscribeSinglePatient,
  subscribeClinicAppointments,
  subscribeClinicQueue,
  subscribeClinicVitals,
  subscribeClinicPrescriptions,
  subscribeClinicLabs,
  subscribeClinicInvoices,
  subscribeClinicAuditLogs,
  fetchClinicPaymentsForInvoices,
} from '../lib/firestore';

const FALLBACK_EMPTY_CLINIC: Clinic = {
  id: 'unassigned',
  name: 'No Active Clinic',
  nameAr: 'لا توجد عيادة نشطة',
  code: '---',
  specialty: 'Healthcare',
  specialtyAr: 'رعاية صحية',
  phone: '',
  email: '',
  city: '',
  address: '',
  status: 'active',
  plan: 'free_spark',
  workingHours: { start: '09:00', end: '21:00', days: [0, 1, 2, 3, 4] },
  branches: [],
  createdAt: '',
};

const FALLBACK_GUEST_USER: UserProfile = {
  id: 'unauthenticated',
  clinicId: 'unassigned',
  role: 'patient',
  name: 'Sign In Required',
  nameAr: 'يلزم تسجيل الدخول',
  email: '',
  phone: '',
};

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  toggleTheme: () => void;
  currentClinicId: string;
  setCurrentClinicId: (id: string) => void;
  currentClinic: Clinic;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  currentUser: UserProfile;
  authUser: FirebaseUser | null;
  liveLoading: boolean;
  liveError: string | null;
  clearLiveError: () => void;
  signInLive: (email: string, password: string) => Promise<UserProfile>;
  signOutLive: () => Promise<void>;
  clinics: Clinic[];
  users: UserProfile[];
  patients: Patient[];
  appointments: Appointment[];
  queues: QueueTicket[];
  vitals: Record<string, VitalSigns>;
  prescriptions: Prescription[];
  labs: LabOrder[];
  invoices: Invoice[];
  ledger: FinancialLedgerEntry[];
  auditLogs: AuditLog[];
  isDemoMode: boolean;
  setIsDemoMode: (val: boolean) => void;
  t: typeof translations.ar;

  // Actions
  addPatient: (patient: Omit<Patient, 'id' | 'createdAt' | 'balance'>) => Promise<Patient>;
  bookAppointment: (apt: Omit<Appointment, 'id' | 'createdAt'>) => Promise<{ success: boolean; message?: string; appointment?: Appointment }>;
  updateAppointmentStatus: (id: string, status: Appointment['status']) => Promise<void>;
  rescheduleAppointment: (id: string, newDate: string, newTimeSlot: string) => Promise<{ success: boolean; message?: string }>;
  checkInPatient: (appointmentId: string, priority?: 'normal' | 'urgent') => Promise<QueueTicket>;
  callNextQueueTicket: (doctorId?: string) => Promise<QueueTicket | null>;
  updateQueueStatus: (ticketId: string, status: QueueTicket['status']) => Promise<void>;
  recordVitals: (patientId: string, vitals: Omit<VitalSigns, 'recordedAt' | 'recordedBy'>) => Promise<void>;
  savePrescription: (rx: Omit<Prescription, 'id' | 'clinicId'>, options?: { queueTicketId?: string }) => Promise<Prescription>;
  createLabOrder: (
    orderData: {
      patientId: string;
      patientName: string;
      doctorId: string;
      doctorName: string;
      testNames: string[];
      appointmentId?: string;
      category?: LabOrder['category'];
    },
    options?: { idempotencyKey?: string }
  ) => Promise<LabOrder>;
  createInvoice: (inv: Omit<Invoice, 'id' | 'clinicId' | 'invoiceNumber'>, payNowAmount?: number) => Promise<Invoice>;
  recordPayment: (invoiceId: string, amount: number, method: 'cash' | 'card' | 'insurance', idempotencyKey?: string) => Promise<void>;
  onboardNewClinic: (clinicData: Omit<Clinic, 'id' | 'createdAt'>, ownerData: { name: string; email: string; phone: string }) => Promise<Clinic>;
  playChimeSound: () => void;
  getWhatsAppUrl: (ticket: QueueTicket) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('ar');
  const [theme, setTheme] = useState<Theme>('light');
  const initialDemoMode = shouldDefaultToDemoMode(envEvaluation);
  const [currentClinicId, setCurrentClinicIdState] = useState<string>(initialDemoMode ? 'clinic-nokhba' : 'unassigned');
  const [currentRole, setCurrentRoleState] = useState<UserRole>(initialDemoMode ? 'clinic_owner' : 'patient');
  const [isDemoMode, setIsDemoModeState] = useState<boolean>(initialDemoMode);

  // Live Auth & Connectivity state
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authProfile, setAuthProfile] = useState<UserProfile | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(
    !envEvaluation.isValid ? envEvaluation.errors.join(' ') : null
  );

  // Core collections (strictly empty when booting in Staging mode so demo records never mix with staging)
  const [clinics, setClinics] = useState<Clinic[]>(initialDemoMode ? INITIAL_CLINICS : []);
  const [users, setUsers] = useState<UserProfile[]>(initialDemoMode ? INITIAL_USERS : []);
  const [patients, setPatients] = useState<Patient[]>(initialDemoMode ? INITIAL_PATIENTS : []);
  const [appointments, setAppointments] = useState<Appointment[]>(initialDemoMode ? INITIAL_APPOINTMENTS : []);
  const [queues, setQueues] = useState<QueueTicket[]>(initialDemoMode ? INITIAL_QUEUES : []);
  const [vitals, setVitals] = useState<Record<string, VitalSigns>>(initialDemoMode ? INITIAL_VITALS : {});
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(initialDemoMode ? INITIAL_PRESCRIPTIONS : []);
  const [labs, setLabs] = useState<LabOrder[]>(initialDemoMode ? INITIAL_LABS : []);
  const [invoices, setInvoices] = useState<Invoice[]>(initialDemoMode ? INITIAL_INVOICES : []);
  const [ledger, setLedger] = useState<FinancialLedgerEntry[]>(initialDemoMode ? INITIAL_LEDGER : []);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialDemoMode ? INITIAL_AUDIT_LOGS : []);

  const clearLiveError = useCallback(() => setLiveError(null), []);

  // Sync document direction and theme classes
  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const clearCollectionsForLive = useCallback(() => {
    setClinics([]);
    setUsers([]);
    setPatients([]);
    setAppointments([]);
    setQueues([]);
    setVitals({});
    setPrescriptions([]);
    setLabs([]);
    setInvoices([]);
    setLedger([]);
    setAuditLogs([]);
  }, []);

  const restoreCollectionsForDemo = useCallback(() => {
    setClinics(INITIAL_CLINICS);
    setUsers(INITIAL_USERS);
    setPatients(INITIAL_PATIENTS);
    setAppointments(INITIAL_APPOINTMENTS);
    setQueues(INITIAL_QUEUES);
    setVitals(INITIAL_VITALS);
    setPrescriptions(INITIAL_PRESCRIPTIONS);
    setLabs(INITIAL_LABS);
    setInvoices(INITIAL_INVOICES);
    setLedger(INITIAL_LEDGER);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setCurrentClinicIdState('clinic-nokhba');
    setCurrentRoleState('clinic_owner');
    setLiveError(null);
    setLiveLoading(false);
  }, []);

  const setIsDemoMode = useCallback(
    (val: boolean) => {
      if (val && envEvaluation.isStagingLocked) {
        setLiveError(
          'Demo Mode fallback is blocked in Staging environment. Use valid Staging Firebase credentials.'
        );
        return;
      }
      if (val === isDemoMode) {
        return;
      }
      setIsDemoModeState(val);
      if (val) {
        setAuthUser(null);
        setAuthProfile(null);
        restoreCollectionsForDemo();
      } else {
        setAuthProfile(null);
        setCurrentRoleState('patient');
        setCurrentClinicIdState('unassigned');
        clearCollectionsForLive();
        setLiveError(!envEvaluation.isValid ? envEvaluation.errors.join(' ') : null);
      }
    },
    [isDemoMode, clearCollectionsForLive, restoreCollectionsForDemo]
  );

  // Authoritative locks in Live Mode: non-Demo roles/tenants come exclusively from /users/{uid}
  const setCurrentRole = useCallback(
    (role: UserRole) => {
      if (!isDemoMode) {
        setLiveError('Role switching is disabled in Live Firebase Mode. Role is enforced by /users/{uid}.');
        return;
      }
      setCurrentRoleState(role);
    },
    [isDemoMode]
  );

  const setCurrentClinicId = useCallback(
    (id: string) => {
      if (!isDemoMode && authProfile?.role !== 'super_admin') {
        setLiveError('Tenant switching is disabled in Live Firebase Mode.');
        return;
      }
      setCurrentClinicIdState(id);
    },
    [isDemoMode, authProfile]
  );

  // Live Firebase Auth listener & connection check
  useEffect(() => {
    if (isDemoMode) return;

    if (!isFirebaseConfigured()) {
      setLiveError(
        envEvaluation.errors[0] ||
          'Firebase configuration missing. Configure VITE_FIREBASE_* environment variables or enable emulator mode.'
      );
      setLiveLoading(false);
      return;
    }

    let cancelled = false;
    setLiveLoading(true);

    testConnection().then((res) => {
      if (!cancelled && !res.ok && res.error) {
        setLiveError(res.error);
      }
    });

    const unsubAuth = onAuthStateChanged(
      (fbUser, profile) => {
        if (cancelled) return;
        setAuthUser(fbUser);
        setAuthProfile(profile);
        if (profile) {
          setCurrentRoleState(profile.role);
          setCurrentClinicIdState(profile.clinicId || 'unassigned');
          setLiveError(null);
        } else {
          clearCollectionsForLive();
        }
        setLiveLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setLiveError(err.message);
        clearCollectionsForLive();
        setLiveLoading(false);
      }
    );

    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, [isDemoMode, clearCollectionsForLive]);

  // Live Firestore real-time subscriptions scoped by authoritative role & clinicId
  useEffect(() => {
    if (isDemoMode || !authUser || !authProfile || !isFirebaseConfigured()) return;

    const clinicId = authProfile.role === 'super_admin' ? currentClinicId : authProfile.clinicId;
    const unsubs: Unsubscribe[] = [];
    const onSubError = (err: Error) => {
      setLiveError(err.message);
    };

    const role = authProfile.role;

    if (role === 'super_admin') {
      unsubs.push(subscribeAllClinics(setClinics, onSubError));
      // Super admin cannot read tenant PHI/clinical/billing documents under firestore.rules;
      // only inspect tenant users/auditLogs when a concrete clinic (not 'platform'/'unassigned') is selected.
      setPatients([]);
      setAppointments([]);
      setQueues([]);
      setVitals({});
      setPrescriptions([]);
      setLabs([]);
      setInvoices([]);
      setLedger([]);

      if (clinicId && clinicId !== 'unassigned' && clinicId !== 'platform') {
        unsubs.push(subscribeClinicUsers(clinicId, setUsers, onSubError));
        unsubs.push(subscribeClinicAuditLogs(clinicId, setAuditLogs, onSubError));
      } else {
        setUsers([]);
        setAuditLogs([]);
      }

      return () => {
        unsubs.forEach((u) => u());
      };
    }

    if (!clinicId || clinicId === 'unassigned') return;

    const isPatientRole = role === 'patient';
    const patientScopeId = isPatientRole ? authProfile.patientId || authProfile.id : undefined;

    unsubs.push(
      subscribeClinicDoc(
        clinicId,
        (c) => setClinics(c ? [c] : []),
        onSubError
      )
    );

    if (isPatientRole) {
      // Patients can read practitioner profiles (doctor/clinic_owner) for booking without exposing other patients' /users PII
      unsubs.push(subscribeClinicPractitioners(clinicId, setUsers, onSubError));
    } else {
      unsubs.push(subscribeClinicUsers(clinicId, setUsers, onSubError));
    }

    unsubs.push(subscribeClinicAppointments(clinicId, setAppointments, onSubError, patientScopeId));
    unsubs.push(subscribeClinicQueue(clinicId, setQueues, onSubError, patientScopeId));

    if (!isPatientRole) {
      unsubs.push(subscribeClinicPatients(clinicId, setPatients, onSubError));
    } else if (patientScopeId) {
      // Patient reads only their own patient document (matches firestore.rules isPatientOwner)
      unsubs.push(subscribeSinglePatient(clinicId, patientScopeId, setPatients, onSubError));
    }

    if (hasRolePermission(role, 'canAccessPHI') || isPatientRole) {
      unsubs.push(subscribeClinicVitals(clinicId, setVitals, onSubError, patientScopeId));
      unsubs.push(subscribeClinicPrescriptions(clinicId, setPrescriptions, onSubError, patientScopeId));
      unsubs.push(subscribeClinicLabs(clinicId, setLabs, onSubError, patientScopeId));
    } else {
      setVitals({});
      setPrescriptions([]);
      setLabs([]);
    }

    if (
      hasRolePermission(role, 'canManageBilling') ||
      hasRolePermission(role, 'canIssueInvoices') ||
      isPatientRole
    ) {
      unsubs.push(
        subscribeClinicInvoices(
          clinicId,
          (invs) => {
            setInvoices(invs);
            fetchClinicPaymentsForInvoices(
              clinicId,
              invs.map((i) => i.id)
            )
              .then(setLedger)
              .catch((err) => console.warn('Ledger fetch error:', err));
          },
          onSubError,
          patientScopeId
        )
      );
    } else {
      setInvoices([]);
      setLedger([]);
    }

    if (hasRolePermission(role, 'canReadAuditLogs')) {
      unsubs.push(subscribeClinicAuditLogs(clinicId, setAuditLogs, onSubError));
    } else {
      setAuditLogs([]);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isDemoMode, authUser, authProfile, currentClinicId]);

  const signInLive = useCallback(async (email: string, password: string): Promise<UserProfile> => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const profile = await authSignIn(email, password);
      setAuthProfile(profile);
      setCurrentRoleState(profile.role);
      setCurrentClinicIdState(profile.clinicId);
      return profile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveError(msg);
      throw err;
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const signOutLive = useCallback(async (): Promise<void> => {
    await authSignOut();
    setAuthUser(null);
    setAuthProfile(null);
    setCurrentRoleState('patient');
    setCurrentClinicIdState('unassigned');
    clearCollectionsForLive();
  }, [clearCollectionsForLive]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const currentClinic =
    clinics.find((c) => c.id === currentClinicId) || clinics[0] || FALLBACK_EMPTY_CLINIC;

  const currentUser = !isDemoMode
    ? authProfile || FALLBACK_GUEST_USER
    : users.find((u) => u.clinicId === currentClinicId && u.role === currentRole) ||
      users.find((u) => u.role === currentRole) ||
      users[0] ||
      FALLBACK_GUEST_USER;

  const t = translations[language];

  // Sound chime synthesizer via Web Audio API
  const playChimeSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.2);
      gain2.gain.setValueAtTime(0.4, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 0.8);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  const assertLiveAuthenticated = () => {
    if (!isDemoMode && (!authUser || !authProfile)) {
      throw new Error('Authentication required in Live Firebase Mode. Please sign in first.');
    }
  };

  const addPatient = async (patientData: Omit<Patient, 'id' | 'createdAt' | 'balance'>): Promise<Patient> => {
    if (!isDemoMode) {
      assertLiveAuthenticated();
      checkRolePermission(currentRole, 'canEnrollPatients');
      const created = await createPatientRecord(currentClinicId, patientData);
      await writeAuditLog(currentClinicId, {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'PATIENT_ENROLLED',
        entity: 'Patient',
        details: `Enrolled patient: ${created.name} (${created.fileNumber})`,
      });
      return created;
    }

    const newId = `pat-${Date.now()}`;
    const newPatient: Patient = {
      ...patientData,
      id: newId,
      balance: 0,
      createdAt: new Date().toISOString(),
    };
    setPatients((prev) => [newPatient, ...prev]);

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        clinicId: currentClinicId,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'PATIENT_ENROLLED',
        entity: 'Patient',
        details: `Enrolled patient: ${newPatient.name} (${newPatient.fileNumber})`,
      },
      ...prev,
    ]);

    return newPatient;
  };

  const bookAppointment = async (
    aptData: Omit<Appointment, 'id' | 'createdAt'>
  ): Promise<{ success: boolean; message?: string; appointment?: Appointment }> => {
    if (!isDemoMode) {
      assertLiveAuthenticated();
      try {
        const created = await bookAppointmentWithSlotTransaction(aptData.clinicId || currentClinicId, aptData);
        await writeAuditLog(aptData.clinicId || currentClinicId, {
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: currentRole,
          action: 'APPOINTMENT_SCHEDULED',
          entity: 'Appointment',
          details: `Booked appointment for ${created.patientName} with ${created.doctorName}`,
        });
        return { success: true, appointment: created };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLiveError(message);
        return { success: false, message };
      }
    }

    const conflict = appointments.find(
      (a) =>
        a.clinicId === aptData.clinicId &&
        a.doctorId === aptData.doctorId &&
        a.date === aptData.date &&
        a.timeSlot === aptData.timeSlot &&
        a.status !== 'cancelled'
    );

    if (conflict) {
      return {
        success: false,
        message:
          language === 'ar'
            ? `يوجد حجز مسبق للطبيب في هذا التوقيت (${aptData.timeSlot}) مع المريض: ${conflict.patientName}`
            : `Doctor schedule conflict at ${aptData.timeSlot} with patient: ${conflict.patientName}`,
      };
    }

    const newId = `apt-${Date.now()}`;
    const newApt: Appointment = {
      ...aptData,
      id: newId,
      createdAt: new Date().toISOString(),
    };
    setAppointments((prev) => [newApt, ...prev]);

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        clinicId: currentClinicId,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'APPOINTMENT_SCHEDULED',
        entity: 'Appointment',
        details: `Booked appointment for ${newApt.patientName} with ${newApt.doctorName}`,
      },
      ...prev,
    ]);

    return { success: true, appointment: newApt };
  };

  const updateAppointmentStatus = async (id: string, status: Appointment['status']): Promise<void> => {
    if (!isDemoMode) {
      assertLiveAuthenticated();
      try {
        if (status === 'cancelled') {
          await cancelAppointmentTransaction(currentClinicId, id);
        } else {
          await updateAppointmentStatusTransaction(currentClinicId, id, status);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLiveError(msg);
        throw err;
      }
      return;
    }

    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const rescheduleAppointment = async (
    id: string,
    newDate: string,
    newTimeSlot: string
  ): Promise<{ success: boolean; message?: string }> => {
    if (!isDemoMode) {
      assertLiveAuthenticated();
      try {
        await rescheduleAppointmentTransaction(currentClinicId, id, newDate, newTimeSlot);
        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLiveError(msg);
        return { success: false, message: msg };
      }
    }

    const target = appointments.find((a) => a.id === id);
    if (!target) return { success: false, message: 'Appointment not found' };
    const conflict = appointments.find(
      (a) =>
        a.id !== id &&
        a.clinicId === target.clinicId &&
        a.doctorId === target.doctorId &&
        a.date === newDate &&
        a.timeSlot === newTimeSlot &&
        a.status !== 'cancelled'
    );
    if (conflict) {
      return { success: false, message: `Schedule conflict at ${newTimeSlot}` };
    }
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, date: newDate, timeSlot: newTimeSlot } : a))
    );
    return { success: true };
  };

  const checkInPatient = async (
    appointmentId: string,
    priority: 'normal' | 'urgent' = 'normal'
  ): Promise<QueueTicket> => {
    const existingTokens = queues
      .filter((q) => q.clinicId === currentClinicId)
      .map((q) => parseInt(q.tokenNumber.replace(/\D/g, '') || '10', 10));
    const nextNum = existingTokens.length > 0 ? Math.max(...existingTokens) + 1 : 10;
    const tokenStr = `A-${String(nextNum).padStart(3, '0')}`;
    const waitingAhead = queues.filter((q) => q.clinicId === currentClinicId && q.status === 'waiting').length;
    const estWait = (waitingAhead + 1) * 15;

    if (!isDemoMode) {
      assertLiveAuthenticated();
      checkRolePermission(currentRole, 'canManageQueue');
      const created = await checkInPatientTransaction(currentClinicId, appointmentId, tokenStr, estWait, priority);
      await writeAuditLog(currentClinicId, {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'QUEUE_CHECK_IN',
        entity: 'Queue',
        details: `Issued token ${tokenStr} for ${created.patientName}`,
      });
      return created;
    }

    const apt = appointments.find((a) => a.id === appointmentId);
    if (!apt) throw new Error('Appointment not found');

    const newTicket: QueueTicket = {
      id: `q-${Date.now()}`,
      clinicId: currentClinicId,
      branchId: apt.branchId,
      appointmentId: apt.id,
      patientId: apt.patientId,
      patientName: apt.patientName,
      patientPhone: apt.patientPhone,
      doctorId: apt.doctorId,
      doctorName: apt.doctorName,
      tokenNumber: tokenStr,
      status: 'waiting',
      estimatedWaitMin: estWait,
      createdAt: new Date().toISOString(),
      priority,
    };

    setQueues((prev) => [...prev, newTicket]);
    setAppointments((prev) =>
      prev.map((a) => (a.id === appointmentId ? { ...a, status: 'arrived', queueToken: tokenStr } : a))
    );

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        clinicId: currentClinicId,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'QUEUE_CHECK_IN',
        entity: 'Queue',
        details: `Issued token ${tokenStr} for ${apt.patientName}`,
      },
      ...prev,
    ]);

    return newTicket;
  };

  const callNextQueueTicket = async (doctorId?: string): Promise<QueueTicket | null> => {
    checkRolePermission(currentRole, 'canManageQueue');
    const waitingTickets = queues.filter(
      (q) => q.clinicId === currentClinicId && q.status === 'waiting' && (!doctorId || q.doctorId === doctorId)
    );

    if (waitingTickets.length === 0) return null;
    const nextTicket = waitingTickets[0];

    if (!isDemoMode) {
      assertLiveAuthenticated();
      await updateQueueTicketStatusTransaction(currentClinicId, nextTicket.id, 'called');
      playChimeSound();
      await writeAuditLog(currentClinicId, {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'PATIENT_CALLED',
        entity: 'Queue',
        details: `Called token ${nextTicket.tokenNumber} to room`,
      });
      return { ...nextTicket, status: 'called', estimatedWaitMin: 0 };
    }

    playChimeSound();
    setQueues((prev) =>
      prev.map((q) =>
        q.id === nextTicket.id
          ? { ...q, status: 'called', calledAt: new Date().toISOString(), estimatedWaitMin: 0 }
          : q
      )
    );

    setAppointments((prev) =>
      prev.map((a) => (a.id === nextTicket.appointmentId ? { ...a, status: 'arrived' } : a))
    );

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        clinicId: currentClinicId,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'PATIENT_CALLED',
        entity: 'Queue',
        details: `Called token ${nextTicket.tokenNumber} to room`,
      },
      ...prev,
    ]);

    return nextTicket;
  };

  const updateQueueStatus = async (ticketId: string, status: QueueTicket['status']): Promise<void> => {
    if (!isDemoMode) {
      assertLiveAuthenticated();
      checkRolePermission(currentRole, 'canManageQueue');
      await updateQueueTicketStatusTransaction(currentClinicId, ticketId, status);
      return;
    }

    const ticket = queues.find((q) => q.id === ticketId);
    setQueues((prev) =>
      prev.map((q) => {
        if (q.id === ticketId) {
          const updated = { ...q, status };
          if (status === 'in_room') updated.startedAt = new Date().toISOString();
          if (status === 'completed') updated.completedAt = new Date().toISOString();
          return updated;
        }
        return q;
      })
    );

    if (ticket) {
      if (status === 'in_room') {
        setAppointments((prev) =>
          prev.map((a) => (a.id === ticket.appointmentId ? { ...a, status: 'in_consultation' } : a))
        );
      } else if (status === 'completed') {
        setAppointments((prev) =>
          prev.map((a) => (a.id === ticket.appointmentId ? { ...a, status: 'completed' } : a))
        );
      }
    }
  };

  const recordVitals = async (
    patientId: string,
    vitalsData: Omit<VitalSigns, 'recordedAt' | 'recordedBy'>
  ): Promise<void> => {
    const updated: VitalSigns = {
      ...vitalsData,
      recordedAt: new Date().toISOString(),
      recordedBy: currentUser.name,
    };

    if (!isDemoMode) {
      assertLiveAuthenticated();
      checkRolePermission(currentRole, 'canAccessPHI');
      await recordPatientVitals(currentClinicId, patientId, updated);
      return;
    }

    setVitals((prev) => ({
      ...prev,
      [patientId]: updated,
    }));
  };

  const savePrescription = async (
    rxData: Omit<Prescription, 'id' | 'clinicId'>,
    options?: { queueTicketId?: string }
  ): Promise<Prescription> => {
    if (!isDemoMode) {
      assertLiveAuthenticated();
      checkRolePermission(currentRole, 'canModifyClinicalRecords');
      const created = await savePrescriptionTransaction(currentClinicId, rxData, options);
      await writeAuditLog(currentClinicId, {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'PRESCRIPTION_ISSUED',
        entity: 'Prescription',
        details: `Issued Rx for ${created.patientName}: ${created.medications.map((m) => m.name).join(', ')}`,
      });
      return created;
    }

    const newRx: Prescription = {
      ...rxData,
      id: `rx-${Date.now()}`,
      clinicId: currentClinicId,
      status: 'finalized',
    };
    setPrescriptions((prev) => [newRx, ...prev]);

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        clinicId: currentClinicId,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'PRESCRIPTION_ISSUED',
        entity: 'Prescription',
        details: `Issued Rx for ${newRx.patientName}: ${newRx.medications.map((m) => m.name).join(', ')}`,
      },
      ...prev,
    ]);

    return newRx;
  };

  const createLabOrder = async (
    orderData: {
      patientId: string;
      patientName: string;
      doctorId: string;
      doctorName: string;
      testNames: string[];
      appointmentId?: string;
      category?: LabOrder['category'];
    },
    options?: { idempotencyKey?: string }
  ): Promise<LabOrder> => {
    checkRolePermission(currentRole, 'canAccessPHI');
    const uniqueTests = normalizeLabTestNames(orderData.testNames);
    if (uniqueTests.length === 0) {
      throw new Error(
        language === 'ar'
          ? 'يرجى تحديد تحليل مخبري واحد على الأقل قبل الإرسال.'
          : 'Please select at least one laboratory test before submitting.'
      );
    }

    if (!isDemoMode) {
      assertLiveAuthenticated();
      const created = await createLabOrderRecord(currentClinicId, orderData, {
        idempotencyKey: options?.idempotencyKey,
        existingOrders: labs,
      });
      await writeAuditLog(currentClinicId, {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'LAB_ORDER_CREATED',
        entity: 'LabOrder',
        details: `Ordered ${uniqueTests.length} lab test(s) for ${created.patientName}: ${uniqueTests.join(', ')}`,
      });
      return created;
    }

    const signature = buildLabOrderSignature(orderData.patientId, uniqueTests);
    const activeStatuses: LabOrder['status'][] = ['pending', 'ordered', 'sample_taken'];
    const duplicate = labs.find(
      (existing) =>
        existing.clinicId === currentClinicId &&
        existing.patientId === orderData.patientId &&
        activeStatuses.includes(existing.status) &&
        buildLabOrderSignature(existing.patientId, existing.tests.map((item) => item.testName)) === signature
    );
    if (duplicate) {
      throw new DuplicateLabOrderError(
        language === 'ar'
          ? `يوجد طلب تحاليل نشط بنفس الفحوصات للمريض ${orderData.patientName} (${duplicate.id}).`
          : `An active laboratory order with the exact selected tests already exists for ${orderData.patientName} (${duplicate.id}).`
      );
    }

    const labId = options?.idempotencyKey
      ? `lab-${options.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : `lab-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const inferredCategory: LabOrder['category'] =
      orderData.category || LAB_TEST_CATALOG[uniqueTests[0]]?.category || 'biochemistry';

    const newLabOrder: LabOrder = {
      id: labId,
      clinicId: currentClinicId,
      patientId: orderData.patientId,
      patientName: orderData.patientName,
      doctorId: orderData.doctorId,
      doctorName: orderData.doctorName,
      ...(orderData.appointmentId ? { appointmentId: orderData.appointmentId } : {}),
      category: inferredCategory,
      tests: buildLabOrderItems(uniqueTests),
      status: 'ordered',
      orderedAt: new Date().toISOString(),
      orderSignature: signature,
    };

    setLabs((prev) => [newLabOrder, ...prev]);
    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        clinicId: currentClinicId,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'LAB_ORDER_CREATED',
        entity: 'LabOrder',
        details: `Ordered ${uniqueTests.length} lab test(s) for ${newLabOrder.patientName}: ${uniqueTests.join(', ')}`,
      },
      ...prev,
    ]);

    return newLabOrder;
  };

  const createInvoice = async (
    invData: Omit<Invoice, 'id' | 'clinicId' | 'invoiceNumber'>,
    payNowAmount?: number
  ): Promise<Invoice> => {
    const invCount = invoices.filter((i) => i.clinicId === currentClinicId).length + 1;
    const invNum = `INV-2026-${String(invCount).padStart(4, '0')}`;

    if (!isDemoMode) {
      assertLiveAuthenticated();
      checkRolePermission(currentRole, 'canIssueInvoices');
      const amountToCollect = payNowAmount ?? invData.paidAmount;
      if (amountToCollect > 0) {
        checkRolePermission(currentRole, 'canCollectPayments');
      }
      const createdInv = await createInvoiceRecord(
        currentClinicId,
        {
          patientId: invData.patientId,
          patientName: invData.patientName,
          ...(invData.appointmentId ? { appointmentId: invData.appointmentId } : {}),
          date: invData.date,
          items: invData.items,
          subtotal: invData.subtotal,
          tax: invData.tax,
          discount: invData.discount,
          totalAmount: invData.totalAmount,
          paymentMethod: invData.paymentMethod,
          ...(invData.notes ? { notes: invData.notes } : {}),
        },
        invNum
      );

      if (amountToCollect > 0) {
        const res = await recordPaymentTransaction(currentClinicId, createdInv.id, {
          amount: amountToCollect,
          paymentMethod: invData.paymentMethod,
          cashierName: currentUser.name,
          patientName: invData.patientName,
          notes: invData.notes,
        });
        setLedger((prev) => [res.ledgerEntry, ...prev]);
        return {
          ...createdInv,
          paidAmount: res.invoice.paidAmount ?? amountToCollect,
          remainingAmount: res.invoice.remainingAmount ?? Math.max(0, createdInv.totalAmount - amountToCollect),
          paymentStatus: res.invoice.paymentStatus ?? 'paid',
        };
      }

      await writeAuditLog(currentClinicId, {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'INVOICE_GENERATED',
        entity: 'Invoice',
        details: `Created invoice ${invNum} for ${createdInv.patientName} (${createdInv.totalAmount} SAR)`,
      });

      return createdInv;
    }

    const newInv: Invoice = {
      ...invData,
      id: `inv-${Date.now()}`,
      clinicId: currentClinicId,
      invoiceNumber: invNum,
    };
    setInvoices((prev) => [newInv, ...prev]);

    if (newInv.paidAmount > 0) {
      const newLedger: FinancialLedgerEntry = {
        id: `led-${Date.now()}`,
        clinicId: currentClinicId,
        invoiceId: newInv.id,
        receiptNumber: `RCP-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: new Date().toISOString(),
        type: 'payment',
        amount: newInv.paidAmount,
        paymentMethod: newInv.paymentMethod,
        cashierName: currentUser.name,
        patientName: newInv.patientName,
      };
      setLedger((prev) => [newLedger, ...prev]);
    }

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        clinicId: currentClinicId,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentRole,
        action: 'INVOICE_GENERATED',
        entity: 'Invoice',
        details: `Created invoice ${invNum} for ${newInv.patientName} (${newInv.totalAmount} SAR)`,
      },
      ...prev,
    ]);

    return newInv;
  };

  const recordPayment = async (
    invoiceId: string,
    amount: number,
    method: 'cash' | 'card' | 'insurance',
    idempotencyKey?: string
  ): Promise<void> => {
    const targetInv = invoices.find((i) => i.id === invoiceId);

    if (!isDemoMode) {
      assertLiveAuthenticated();
      checkRolePermission(currentRole, 'canCollectPayments');
      const res = await recordPaymentTransaction(currentClinicId, invoiceId, {
        amount,
        paymentMethod: method,
        cashierName: currentUser.name,
        patientName: targetInv?.patientName || 'Patient',
        idempotencyKey,
      });
      if (!res.idempotentReplay) {
        setLedger((prev) => [res.ledgerEntry, ...prev]);
      }
      return;
    }

    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === invoiceId) {
          const remaining = inv.totalAmount - inv.paidAmount;
          if (amount > remaining) {
            throw new Error(`Overpayment rejected: remaining balance is ${remaining} SAR`);
          }
          const newPaid = inv.paidAmount + amount;
          const newStatus = newPaid >= inv.totalAmount ? 'paid' : 'partial';
          return {
            ...inv,
            paidAmount: newPaid,
            remainingAmount: inv.totalAmount - newPaid,
            paymentStatus: newStatus,
          };
        }
        return inv;
      })
    );

    if (targetInv) {
      const newLedger: FinancialLedgerEntry = {
        id: `led-${Date.now()}`,
        clinicId: currentClinicId,
        invoiceId,
        receiptNumber: `RCP-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: new Date().toISOString(),
        type: 'payment',
        amount,
        paymentMethod: method,
        cashierName: currentUser.name,
        patientName: targetInv.patientName,
      };
      setLedger((prev) => [newLedger, ...prev]);
    }
  };

  const onboardNewClinic = async (
    clinicData: Omit<Clinic, 'id' | 'createdAt'>,
    ownerData: { name: string; email: string; phone: string }
  ): Promise<Clinic> => {
    if (!isDemoMode) {
      if (!authUser) {
        throw new Error('Sign in with Firebase Auth before provisioning a live clinic tenant.');
      }
      const created = await onboardClinicTransaction(authUser.uid, clinicData, ownerData);
      setCurrentClinicIdState(created.id);
      setCurrentRoleState('clinic_owner');
      return created;
    }

    const newClinicId = `clinic-${Date.now()}`;
    const newClinic: Clinic = {
      ...clinicData,
      id: newClinicId,
      createdAt: new Date().toISOString(),
    };
    setClinics((prev) => [...prev, newClinic]);

    const newOwnerUser: UserProfile = {
      id: `usr-owner-${Date.now()}`,
      clinicId: newClinicId,
      role: 'clinic_owner',
      name: ownerData.name,
      nameAr: ownerData.name,
      email: ownerData.email,
      phone: ownerData.phone,
      specialty: clinicData.specialty,
      specialtyAr: clinicData.specialtyAr,
    };
    setUsers((prev) => [...prev, newOwnerUser]);

    setCurrentClinicIdState(newClinicId);
    setCurrentRoleState('clinic_owner');

    return newClinic;
  };

  const getWhatsAppUrl = (ticket: QueueTicket) => {
    const cleanPhone = ticket.patientPhone.replace(/\D/g, '');
    const msg = t.whatsappMessageTemplate
      .replace('{name}', ticket.patientName)
      .replace('{doctor}', ticket.doctorName)
      .replace('{token}', ticket.tokenNumber)
      .replace('{wait}', String(ticket.estimatedWaitMin));
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        theme,
        toggleTheme,
        currentClinicId,
        setCurrentClinicId,
        currentClinic,
        currentRole,
        setCurrentRole,
        currentUser,
        authUser,
        liveLoading,
        liveError,
        clearLiveError,
        signInLive,
        signOutLive,
        clinics,
        users,
        patients,
        appointments,
        queues,
        vitals,
        prescriptions,
        labs,
        invoices,
        ledger,
        auditLogs,
        isDemoMode,
        setIsDemoMode,
        t,
        addPatient,
        bookAppointment,
        updateAppointmentStatus,
        rescheduleAppointment,
        checkInPatient,
        callNextQueueTicket,
        updateQueueStatus,
        recordVitals,
        savePrescription,
        createLabOrder,
        createInvoice,
        recordPayment,
        onboardNewClinic,
        playChimeSound,
        getWhatsAppUrl,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};

