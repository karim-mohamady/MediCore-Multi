/**
 * Tenant Isolation Architecture & Validation Guards
 * Enforces logical multi-tenancy on Firestore across all operations.
 */

export class TenantAccessError extends Error {
  constructor(message: string) {
    super(`[TENANT_ISOLATION_VIOLATION] ${message}`);
    this.name = 'TenantAccessError';
  }
}

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function assertValidDocumentId(id: string, label = 'documentId'): void {
  if (!id || !VALID_ID_REGEX.test(id)) {
    throw new TenantAccessError(
      `Invalid ${label} '${id}'. IDs must be 1-128 alphanumeric, underscore, or hyphen characters.`
    );
  }
}

/**
 * Validates that an authenticated user belongs to the requested clinic.
 * Super Admins are granted cross-tenant platform administrative access.
 */
export function validateTenantAccess(
  userClinicId: string,
  targetClinicId: string,
  userRole?: string
): boolean {
  if (userRole === 'super_admin') {
    if (!targetClinicId || !VALID_ID_REGEX.test(targetClinicId)) {
      throw new TenantAccessError('Invalid targetClinicId.');
    }
    return true;
  }

  if (!userClinicId || !targetClinicId) {
    throw new TenantAccessError('Both userClinicId and targetClinicId must be explicitly defined.');
  }

  assertValidDocumentId(userClinicId, 'userClinicId');
  assertValidDocumentId(targetClinicId, 'targetClinicId');

  if (userClinicId !== targetClinicId) {
    throw new TenantAccessError(
      `Access Denied: User belonging to clinic '${userClinicId}' attempted unauthorized operation on target clinic '${targetClinicId}'.`
    );
  }

  return true;
}

export type TenantSubCollection =
  | 'members'
  | 'branches'
  | 'patients'
  | 'patientClinicalRecords'
  | 'appointmentSlots'
  | 'appointments'
  | 'queues'
  | 'consultations'
  | 'prescriptions'
  | 'labResults'
  | 'invoices'
  | 'auditLogs';

/**
 * Generates canonical tenant-scoped Firestore document path:
 * /clinics/{clinicId}/{subCollection}/{documentId}
 */
export function buildTenantPath(
  clinicId: string,
  subCollection: TenantSubCollection,
  documentId?: string
): string {
  assertValidDocumentId(clinicId, 'clinicId');
  if (documentId !== undefined) {
    assertValidDocumentId(documentId, 'documentId');
  }

  const basePath = `clinics/${clinicId}/${subCollection}`;
  return documentId ? `${basePath}/${documentId}` : basePath;
}

/**
 * Validates slot reservation key format:
 * Slot key = {doctorId}_{date}_{timeSlot}
 */
export function buildSlotKey(doctorId: string, date: string, timeSlot: string): string {
  assertValidDocumentId(doctorId, 'doctorId');
  const sanitizedDate = date.replace(/[^0-9-]/g, '');
  const sanitizedSlot = timeSlot.replace(':', '').replace(/[^0-9]/g, '');
  if (!sanitizedDate || !sanitizedSlot) {
    throw new TenantAccessError('Invalid date or timeSlot for deterministic slot key.');
  }
  return `${doctorId}_${sanitizedDate}_${sanitizedSlot}`;
}
