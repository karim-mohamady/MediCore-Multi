import { CANONICAL_ROLES, UserRole } from '../types';

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(`[RBAC_UNAUTHORIZED] ${message}`);
    this.name = 'AuthorizationError';
  }
}

/**
 * Explicit legacy role normalization map.
 * Legacy 'admin' is mapped down to 'clinic_manager' (least privilege), never 'clinic_owner' or 'super_admin'.
 * Unrecognized roles (including unsupported aliases like 'pharmacist') are explicitly rejected.
 */
export const LEGACY_ROLE_MAP: Readonly<Record<string, UserRole>> = {
  admin: 'clinic_manager',
};

export function isCanonicalRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (CANONICAL_ROLES as readonly string[]).includes(role);
}

export function normalizeRole(rawRole: unknown): UserRole {
  if (isCanonicalRole(rawRole)) {
    return rawRole;
  }
  if (typeof rawRole === 'string' && rawRole in LEGACY_ROLE_MAP) {
    return LEGACY_ROLE_MAP[rawRole];
  }
  throw new AuthorizationError(
    `Unsupported or unrecognized role '${String(rawRole)}'. Only the 8 canonical roles are permitted.`
  );
}

export interface RolePermissionMatrix {
  canAccessPHI: boolean;
  canAccessOwnRecords: boolean;
  canModifyClinicalRecords: boolean;
  canEnrollPatients: boolean;
  canManageBilling: boolean;
  canIssueInvoices: boolean;
  canCollectPayments: boolean;
  canManageQueue: boolean;
  canScheduleAppointments: boolean;
  canManageClinicSettings: boolean;
  canReadAuditLogs: boolean;
  canManagePlatform: boolean;
}

/**
 * Authorization matrix aligned 1:1 with Firestore Security Rules (firestore.rules).
 */
export const ROLE_PERMISSIONS: Record<UserRole, RolePermissionMatrix> = {
  super_admin: {
    canAccessPHI: false,
    canAccessOwnRecords: false,
    canModifyClinicalRecords: false,
    canEnrollPatients: false,
    canManageBilling: false,
    canIssueInvoices: false,
    canCollectPayments: false,
    canManageQueue: false,
    canScheduleAppointments: false,
    canManageClinicSettings: true,
    canReadAuditLogs: true,
    canManagePlatform: true,
  },
  clinic_owner: {
    canAccessPHI: true,
    canAccessOwnRecords: true,
    canModifyClinicalRecords: false, // Consultations & Rx require 'doctor' role in firestore.rules
    canEnrollPatients: true,
    canManageBilling: true,
    canIssueInvoices: true,
    canCollectPayments: true,
    canManageQueue: true,
    canScheduleAppointments: true,
    canManageClinicSettings: true,
    canReadAuditLogs: true,
    canManagePlatform: false,
  },
  clinic_manager: {
    canAccessPHI: false,
    canAccessOwnRecords: false,
    canModifyClinicalRecords: false,
    canEnrollPatients: true,
    canManageBilling: true,
    canIssueInvoices: true,
    canCollectPayments: true,
    canManageQueue: true,
    canScheduleAppointments: true,
    canManageClinicSettings: false,
    canReadAuditLogs: false,
    canManagePlatform: false,
  },
  doctor: {
    canAccessPHI: true,
    canAccessOwnRecords: true,
    canModifyClinicalRecords: true,
    canEnrollPatients: false, // Matches firestore.rules isReceptionistOrStaff (does not include doctor)
    canManageBilling: false,
    canIssueInvoices: false,
    canCollectPayments: false,
    canManageQueue: true,
    canScheduleAppointments: true,
    canManageClinicSettings: false,
    canReadAuditLogs: false,
    canManagePlatform: false,
  },
  receptionist: {
    canAccessPHI: false,
    canAccessOwnRecords: false,
    canModifyClinicalRecords: false,
    canEnrollPatients: true,
    canManageBilling: false,
    canIssueInvoices: true, // Can create/read invoices in firestore.rules
    canCollectPayments: false, // Only accountant/clinic_manager/clinic_owner can record payments
    canManageQueue: true,
    canScheduleAppointments: true,
    canManageClinicSettings: false,
    canReadAuditLogs: false,
    canManagePlatform: false,
  },
  nurse: {
    canAccessPHI: true, // Can record vitals and read prescriptions/lab orders
    canAccessOwnRecords: true,
    canModifyClinicalRecords: false, // Cannot author/finalize consultations or prescriptions
    canEnrollPatients: true,
    canManageBilling: false,
    canIssueInvoices: false,
    canCollectPayments: false,
    canManageQueue: true,
    canScheduleAppointments: false,
    canManageClinicSettings: false,
    canReadAuditLogs: false,
    canManagePlatform: false,
  },
  accountant: {
    canAccessPHI: false,
    canAccessOwnRecords: false,
    canModifyClinicalRecords: false,
    canEnrollPatients: false,
    canManageBilling: true,
    canIssueInvoices: true,
    canCollectPayments: true,
    canManageQueue: false,
    canScheduleAppointments: false,
    canManageClinicSettings: false,
    canReadAuditLogs: false,
    canManagePlatform: false,
  },
  patient: {
    canAccessPHI: false, // Cannot access clinic-wide PHI
    canAccessOwnRecords: true, // Scoped strictly by patientId/userId in firestore.rules
    canModifyClinicalRecords: false,
    canEnrollPatients: false,
    canManageBilling: false,
    canIssueInvoices: false,
    canCollectPayments: false,
    canManageQueue: false,
    canScheduleAppointments: true, // Own appointments only
    canManageClinicSettings: false,
    canReadAuditLogs: false,
    canManagePlatform: false,
  },
};

/**
 * Non-throwing permission check helper used by UI/context subscription guards.
 */
export function hasRolePermission(
  role: UserRole,
  permission: keyof RolePermissionMatrix
): boolean {
  try {
    const canonicalRole = normalizeRole(role);
    return Boolean(ROLE_PERMISSIONS[canonicalRole]?.[permission]);
  } catch {
    return false;
  }
}

/**
 * Validates whether a role is authorized to perform an operation.
 */
export function checkRolePermission(
  role: UserRole,
  permission: keyof RolePermissionMatrix
): boolean {
  const canonicalRole = normalizeRole(role);
  const perm = ROLE_PERMISSIONS[canonicalRole]?.[permission];
  if (!perm) {
    throw new AuthorizationError(
      `Role '${canonicalRole}' is not authorized for permission '${permission}'.`
    );
  }
  return true;
}

/**
 * Enforces clinical record immutability once finalized.
 */
export function assertClinicalRecordModifiable(status: string): void {
  if (status === 'finalized' || status === 'signed') {
    throw new AuthorizationError(
      'Medical Record Invariant Violation: Finalized clinical records are immutable and cannot be altered or deleted.'
    );
  }
}

/**
 * Role-based UI route authorization matrix (single source of truth for Sidebar, Header, BottomNav, and App).
 */
export const VIEW_ALLOWED_ROLES: Readonly<Record<string, readonly UserRole[]>> = {
  landing: CANONICAL_ROLES,
  dashboard: ['super_admin', 'clinic_owner', 'clinic_manager', 'doctor', 'receptionist', 'nurse', 'accountant'],
  queue: ['super_admin', 'clinic_owner', 'clinic_manager', 'doctor', 'receptionist', 'nurse'],
  appointments: ['super_admin', 'clinic_owner', 'clinic_manager', 'doctor', 'receptionist'],
  patients: ['super_admin', 'clinic_owner', 'clinic_manager', 'doctor', 'receptionist', 'nurse'],
  'doctor-room': ['super_admin', 'clinic_owner', 'doctor', 'nurse'],
  billing: ['super_admin', 'clinic_owner', 'clinic_manager', 'accountant', 'receptionist'],
  excel: ['super_admin', 'clinic_owner', 'clinic_manager', 'receptionist'],
  'patient-portal': ['super_admin', 'patient', 'clinic_owner'],
  'super-admin': ['super_admin'],
};

export function getDefaultViewForRole(role: UserRole): string {
  if (role === 'patient') return 'patient-portal';
  if (role === 'super_admin') return 'super-admin';
  return 'dashboard';
}

export function canAccessView(role: UserRole, view: string): boolean {
  try {
    const canonicalRole = normalizeRole(role);
    const allowed = VIEW_ALLOWED_ROLES[view];
    if (!allowed) return false;
    return allowed.includes(canonicalRole);
  } catch {
    return false;
  }
}
