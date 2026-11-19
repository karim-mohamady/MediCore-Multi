export const CANONICAL_ROLES = [
  'super_admin',
  'clinic_owner',
  'clinic_manager',
  'doctor',
  'receptionist',
  'nurse',
  'accountant',
  'patient',
] as const;

export type UserRole = (typeof CANONICAL_ROLES)[number];

export type Language = 'ar' | 'en';
export type Theme = 'light' | 'dark';

export interface ClinicBranch {
  id: string;
  name: string;
  nameAr: string;
  phone: string;
  city: string;
  address: string;
  isMain: boolean;
}

export interface Clinic {
  id: string; // clinicId
  name: string;
  nameAr: string;
  code: string;
  specialty: string;
  specialtyAr: string;
  logo?: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  status: 'active' | 'trial' | 'suspended';
  ownerUid?: string;
  workingHours: {
    start: string; // e.g. '08:00'
    end: string;   // e.g. '21:00'
    days: number[]; // 0 = Sun, 1 = Mon ...
  };
  branches: ClinicBranch[];
  plan: 'free_spark' | 'professional' | 'enterprise';
  createdAt: string;
}

export interface UserProfile {
  id: string;
  clinicId: string;
  role: UserRole;
  status?: 'active' | 'suspended' | 'disabled';
  patientId?: string;
  name: string;
  nameAr: string;
  email: string;
  phone: string;
  avatar?: string;
  specialty?: string;
  specialtyAr?: string;
  branchId?: string;
  licenseNumber?: string;
}

export interface VitalSigns {
  bpSystolic: number; // mmHg
  bpDiastolic: number; // mmHg
  heartRate: number; // bpm
  temperature: number; // °C
  weightKg: number;
  heightCm: number;
  bmi: number;
  oxygenSat?: number; // %
  recordedAt: string;
  recordedBy: string;
}

export interface Patient {
  id: string;
  clinicId: string;
  userId?: string;
  fileNumber: string; // e.g. MED-8041
  nationalId: string;
  name: string;
  nameAr: string;
  phone: string;
  email?: string;
  gender: 'male' | 'female';
  dob: string;
  bloodGroup: string;
  allergies: string[];
  chronicDiseases: string[];
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  balance: number; // currency balance
  createdAt: string;
  lastVisit?: string;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

export interface Appointment {
  id: string;
  clinicId: string;
  branchId: string;
  doctorId: string;
  doctorName: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // HH:mm
  durationMin: number;
  type: 'consultation' | 'followup' | 'procedure' | 'emergency';
  status: AppointmentStatus;
  notes?: string;
  queueToken?: string; // e.g. A-012
  fee: number;
  createdAt: string;
}

export type QueueStatus =
  | 'waiting'
  | 'called'
  | 'in_room'
  | 'in_consultation'
  | 'completed'
  | 'no_show'
  | 'skipped'
  | 'cancelled';

export interface QueueTicket {
  id: string;
  clinicId: string;
  branchId: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  doctorName: string;
  tokenNumber: string; // e.g. 'A-012'
  status: QueueStatus;
  estimatedWaitMin: number;
  calledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  priority: 'normal' | 'urgent';
}

export interface Medication {
  name: string;
  dosage: string; // e.g. 500mg
  frequency: string; // e.g. Twice daily after meals
  duration: string; // e.g. 7 days
  instructions?: string;
}

export interface Prescription {
  id: string;
  clinicId: string;
  consultationId?: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  date: string;
  diagnosis: string;
  medications: Medication[];
  notes?: string;
  status?: 'draft' | 'finalized';
  qrCodeToken?: string;
}

export interface LabOrderItem {
  testName: string;
  testNameAr: string;
  unit: string;
  referenceRange: string;
  resultValue?: string;
  isAbnormal?: boolean;
}

export interface LabOrder {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  category: 'hematology' | 'biochemistry' | 'radiology' | 'urinalysis';
  tests: LabOrderItem[];
  status: 'pending' | 'ordered' | 'sample_taken' | 'reviewed' | 'completed' | 'approved';
  orderedAt: string;
  completedAt?: string;
  orderSignature?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  descriptionAr: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  clinicId: string;
  invoiceNumber: string; // e.g. INV-2026-0045
  patientId: string;
  patientName: string;
  appointmentId?: string;
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number; // VAT (e.g. 15%)
  discount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount?: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paymentMethod: 'cash' | 'card' | 'insurance';
  insuranceProvider?: string;
  notes?: string;
}

export interface FinancialLedgerEntry {
  id: string;
  clinicId: string;
  invoiceId: string;
  receiptNumber: string;
  timestamp: string;
  type: 'payment' | 'refund';
  amount: number;
  paymentMethod: 'cash' | 'card' | 'insurance';
  cashierName: string;
  patientName: string;
}

export interface AuditLog {
  id: string;
  clinicId: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entity: string;
  details: string;
}
