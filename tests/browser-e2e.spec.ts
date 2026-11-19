import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-medicore';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

interface SeededUsers {
  recUid: string;
  docUid: string;
  accUid: string;
}

let testEnv: RulesTestEnvironment;
let seeded: SeededUsers;

async function ensureAuthEmulatorUser(email: string, password: string, displayName: string): Promise<string> {
  const signUpRes = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
    }
  );
  if (signUpRes.ok) {
    const data = (await signUpRes.json()) as { localId: string };
    return data.localId;
  }

  const signInRes = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  if (!signInRes.ok) {
    throw new Error(`Failed to provision/sign-in Auth Emulator user ${email}: ${await signInRes.text()}`);
  }
  const data = (await signInRes.json()) as { localId: string };
  return data.localId;
}

async function seedEmulatorState(): Promise<SeededUsers> {
  await testEnv.clearFirestore();
  const recUid = await ensureAuthEmulatorUser('rec-pw@medicore.test', 'TestPass123!', 'E2E Receptionist');
  const docUid = await ensureAuthEmulatorUser('doc-pw@medicore.test', 'TestPass123!', 'Dr. Tariq E2E');
  const accUid = await ensureAuthEmulatorUser('acc-pw@medicore.test', 'TestPass123!', 'E2E Accountant');

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await adminDb.doc('clinics/clinic-nokhba').set({
      id: 'clinic-nokhba',
      name: 'Al-Nokhba Medical Center',
      nameAr: 'مركز النخبة الطبي',
      code: 'NOK',
      specialty: 'Multi-Specialty',
      specialtyAr: 'متعدد التخصصات',
      phone: '+966112223333',
      email: 'info@nokhba.test',
      city: 'Riyadh',
      address: 'King Fahd Rd',
      status: 'active',
      ownerUid: 'uid-owner-pw',
      plan: 'professional',
      workingHours: { start: '08:00', end: '22:00', days: [0, 1, 2, 3, 4] },
      branches: [
        {
          id: 'branch-1',
          name: 'Main Branch',
          nameAr: 'الفرع الرئيسي',
          phone: '+966112223333',
          city: 'Riyadh',
          address: 'King Fahd Rd',
          isMain: true,
        },
      ],
      createdAt: new Date().toISOString(),
    });

    await adminDb.doc(`users/${recUid}`).set({
      id: recUid,
      clinicId: 'clinic-nokhba',
      role: 'receptionist',
      status: 'active',
      name: 'E2E Receptionist',
      nameAr: 'موظف الاستقبال',
      email: 'rec-pw@medicore.test',
      phone: '+966500000001',
    });

    await adminDb.doc(`users/${docUid}`).set({
      id: docUid,
      clinicId: 'clinic-nokhba',
      role: 'doctor',
      status: 'active',
      name: 'Dr. Tariq E2E',
      nameAr: 'د. طارق التخصصي',
      email: 'doc-pw@medicore.test',
      phone: '+966500000002',
      specialty: 'Cardiology',
      specialtyAr: 'القلب',
    });

    await adminDb.doc(`users/${accUid}`).set({
      id: accUid,
      clinicId: 'clinic-nokhba',
      role: 'accountant',
      status: 'active',
      name: 'E2E Accountant',
      nameAr: 'المحاسب المالي',
      email: 'acc-pw@medicore.test',
      phone: '+966500000003',
    });

    await adminDb.doc('clinics/clinic-nokhba/patients/pat-pw-1').set({
      id: 'pat-pw-1',
      clinicId: 'clinic-nokhba',
      fileNumber: 'MED-PW-101',
      nationalId: '1011223344',
      name: 'سالم الحربي',
      nameAr: 'سالم الحربي',
      phone: '+966501234567',
      gender: 'male',
      dob: '1988-03-15',
      bloodGroup: 'O+',
      allergies: ['Penicillin'],
      chronicDiseases: ['Hypertension'],
      emergencyContact: { name: 'Khalid', relationship: 'Brother', phone: '+966509998888' },
      balance: 0,
      createdAt: new Date().toISOString(),
    });
  });

  return { recUid, docUid, accUid };
}

async function openFirebaseModalAndSwitchLive(page: Page) {
  await page.getByRole('button', { name: /Firebase Config|ربط Firebase/i }).click();
  await expect(
    page.getByRole('heading', { name: /Firebase Security & Connection Center|إعدادات وأمان Firebase/i })
  ).toBeVisible({ timeout: 10_000 });
  const switchBtn = page.getByRole('button', { name: /Switch to Live Firebase|تبديل إلى Live Firebase/i });
  if (await switchBtn.isVisible().catch(() => false)) {
    await switchBtn.click();
  }
}

async function signInInFirebaseModal(page: Page, email: string, password: string) {
  await openFirebaseModalAndSwitchLive(page);
  const signOutBtn = page.getByRole('button', { name: /Sign Out|تسجيل الخروج/i });
  const emailInput = page.locator('input[type="email"]');

  // Wait briefly for Firebase Auth IndexedDB persistence hydration before inspecting state
  await page.waitForTimeout(400);
  if (!(await signOutBtn.isVisible().catch(() => false))) {
    await Promise.race([
      emailInput.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
      signOutBtn.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
    ]);
  }
  if (await signOutBtn.isVisible().catch(() => false)) {
    await signOutBtn.click();
  }
  await expect(emailInput).toBeVisible({ timeout: 10_000 });
  await emailInput.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Sign In|دخول آمن/i }).click();
  await expect(page.getByText(`Email: ${email}`)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^(Close|إغلاق)$/i }).click();
}

test.describe.serial('MediCore Browser E2E Validation Suite (14 Scenarios)', () => {
  test.beforeAll(async () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules, host: FIRESTORE_HOST, port: FIRESTORE_PORT },
    });
    seeded = await seedEmulatorState();
  });

  test.afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  test('1, 3, 4, 5: App loads cleanly, toggles AR/EN, RTL/LTR direction, and Dark/Light theme', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await expect(page.getByText('MediCore').first()).toBeVisible();

    // Default Arabic + RTL
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Toggle to English + LTR
    await page.getByLabel('Toggle language').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Clinic Operational Overview' })).toBeVisible();

    // Toggle Dark mode on & off
    await page.getByLabel('Toggle theme').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByLabel('Toggle theme').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    // Switch back to Arabic & confirm zero runtime errors
    await page.getByLabel('Toggle language').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(pageErrors).toEqual([]);
  });

  test('2, 6, 7, 14: Live Emulator Auth sign-in (Receptionist), appointment book/reschedule/cancel, check-in, quick call & empty queue feedback', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Toggle language').click(); // Switch to EN for deterministic labels

    await signInInFirebaseModal(page, 'rec-pw@medicore.test', 'TestPass123!');
    await expect(page.getByText('Live Firebase Mode (Enforced)')).toBeVisible();

    // Scenario 14: Quick Queue Call on Dashboard when queue is empty shows clear feedback
    await page.getByRole('button', { name: /Call Next Patient/i }).click();
    await expect(page.getByRole('status')).toContainText('No patients are currently waiting in the queue.');

    // Scenario 6a: Book appointment 1 (will stay active for check-in)
    await page.getByRole('button', { name: /Book Appointment/i }).first().click();
    await expect(page.locator('form select').nth(0).locator('option').first()).toBeAttached({ timeout: 10_000 });
    await expect(page.locator('form select').nth(1).locator('option').first()).toBeAttached({ timeout: 10_000 });
    await page.locator('input[type="date"]').fill('2026-11-25');
    await page.locator('input[type="time"]').fill('10:00');
    await page.getByRole('button', { name: 'Confirm Booking' }).click();
    await expect(page.getByText('Appointment confirmed successfully!')).toBeVisible();
    await page.waitForTimeout(1400);

    // Scenario 6b: Book appointment 2 (will be rescheduled and cancelled)
    await page.getByRole('button', { name: /Book Appointment/i }).first().click();
    await expect(page.locator('form select').nth(0).locator('option').first()).toBeAttached({ timeout: 10_000 });
    await page.locator('input[type="date"]').fill('2026-11-26');
    await page.locator('input[type="time"]').fill('14:00');
    await page.getByRole('button', { name: 'Confirm Booking' }).click();
    await expect(page.getByText('Appointment confirmed successfully!')).toBeVisible();
    await page.waitForTimeout(1400);

    // Go to Appointments view -> switch to List view
    await page.locator('header nav button', { hasText: 'Appointments' }).click();
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByText('2026-11-25 · 10:00')).toBeVisible();
    await expect(page.getByText('2026-11-26 · 14:00')).toBeVisible();

    // Reschedule the 2026-11-26 appointment to 15:30
    const apt2Card = page
      .locator('div.rounded-2xl')
      .filter({ hasText: '2026-11-26 · 14:00' })
      .filter({ has: page.getByRole('button', { name: 'Reschedule' }) })
      .last();
    await apt2Card.getByRole('button', { name: 'Reschedule' }).click();
    await apt2Card.locator('input[type="time"]').fill('15:30');
    await apt2Card.getByRole('button', { name: 'Save Slot' }).click();
    await expect(page.getByText('2026-11-26 · 15:30')).toBeVisible();

    // Cancel the rescheduled appointment
    const apt2UpdatedCard = page
      .locator('div.rounded-2xl')
      .filter({ hasText: '2026-11-26 · 15:30' })
      .last();
    await apt2UpdatedCard.getByRole('button', { name: 'Cancel' }).click();
    await expect(apt2UpdatedCard.locator('span', { hasText: /^cancelled$/i })).toBeVisible();

    // Scenario 7: Check-in Appointment 1 -> verify ticket created -> Call Next Patient on Dashboard & QueueView
    const apt1Card = page
      .locator('div.rounded-2xl')
      .filter({ hasText: '2026-11-25 · 10:00' })
      .last();
    await apt1Card.getByRole('button', { name: 'Check In Now' }).click();
    await expect(apt1Card.locator('span', { hasText: /^arrived$/i })).toBeVisible();

    await page.locator('header nav button', { hasText: 'Dashboard' }).click();
    await page.getByRole('button', { name: /Call Next Patient/i }).click();
    await expect(page.getByRole('status')).toContainText(/Called .* \(Token A-010\)/);
  });

  test('8, 9, 14: Doctor Workspace Rx finalization, Lab Order persistence, duplicate rejection, and reload survival', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Toggle language').click();

    await signInInFirebaseModal(page, 'doc-pw@medicore.test', 'TestPass123!');
    await page.locator('header nav button', { hasText: 'Doctor Room' }).click();

    // Scenario 9: Select CBC + HbA1c, submit lab order explicitly
    await page.getByLabel('Complete Blood Count (CBC)').check();
    await page.getByLabel('HbA1c Glycated Hemoglobin').check();
    await page.getByRole('button', { name: 'Submit Lab Order' }).click();
    await expect(page.getByText(/Laboratory order \(4 test\(s\)\) persisted/)).toBeVisible();

    // Scenario 14: Submitting identical active lab tests again displays DuplicateLabOrderError feedback
    await page.getByRole('button', { name: 'Submit Lab Order' }).click();
    await expect(page.getByText(/LAB_DUPLICATE_ORDER|already exists/i)).toBeVisible();

    // Scenario 8: Finalize consultation + digital Rx
    await page.getByRole('button', { name: 'Sign & Finalize Consultation' }).click();
    await expect(page.getByText('Visit Signed & Saved')).toBeVisible();

    // Reload browser page -> re-enter Live Firebase mode -> verify persisted Lab Order survived reload in Firestore
    await page.reload();
    await page.getByLabel('Toggle language').click();
    await openFirebaseModalAndSwitchLive(page);
    await expect(page.getByText('Email: doc-pw@medicore.test')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^(Close|إغلاق)$/i }).click();

    await page.locator('header nav button', { hasText: 'Doctor Room' }).click();
    await expect(page.getByText('Persisted Lab Orders for Patient:')).toBeVisible();
    await expect(page.locator('span.truncate', { hasText: /Complete Blood Count \(CBC\)/ }).first()).toBeVisible();
  });

  test('10: Billing invoice creation, payment recording, immutable ledger, and reload persistence', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Toggle language').click();

    // Receptionist creates an unpaid invoice
    await signInInFirebaseModal(page, 'rec-pw@medicore.test', 'TestPass123!');
    await page.getByRole('button', { name: 'Create Invoice' }).first().click();
    await expect(page.getByRole('heading', { name: 'Create Medical Invoice & Receipt' })).toBeVisible();
    await expect(page.locator('form select').first().locator('option').first()).toBeAttached({ timeout: 10_000 });
    await page.locator('#payNow').uncheck();
    await page.getByRole('button', { name: 'Generate Invoice' }).click();
    await expect(page.getByRole('heading', { name: 'Create Medical Invoice & Receipt' })).toBeHidden({ timeout: 15_000 });

    // Accountant signs in to collect payment & inspect immutable ledger
    await signInInFirebaseModal(page, 'acc-pw@medicore.test', 'TestPass123!');
    await page.getByRole('button', { name: /Billing & Ledger/i }).first().click();
    await expect(page.getByText('402.5 SAR').first()).toBeVisible();

    await page.getByRole('button', { name: 'Pay Balance' }).first().click();
    await expect(page.locator('span', { hasText: /^Fully Paid$/i }).first()).toBeVisible({ timeout: 10_000 });

    // Switch to Ledger tab & verify payment entry recorded
    await page.getByRole('button', { name: /Immutable Financial Audit Ledger/i }).click();
    await expect(page.getByText(/\+402\.5 SAR/).first()).toBeVisible();

    // Reload & re-verify paid status persists in Firestore Emulator
    await page.reload();
    await page.getByLabel('Toggle language').click();
    await openFirebaseModalAndSwitchLive(page);
    await expect(page.getByText('Email: acc-pw@medicore.test')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^(Close|إغلاق)$/i }).click();

    await page.getByRole('button', { name: /Billing & Ledger/i }).first().click();
    await expect(page.locator('span', { hasText: /^Fully Paid$/i }).first()).toBeVisible();
  });

  test('11, 12, 13: Valid CSV import, malformed/duplicate CSV error reporting, and UTF-8 BOM CSV export download', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Toggle language').click();
    await signInInFirebaseModal(page, 'rec-pw@medicore.test', 'TestPass123!');

    await page.getByRole('button', { name: /Excel & CSV Data/i }).first().click();

    // Scenario 11: Valid CSV import (Arabic + English UTF-8 row)
    const validCsv = '\uFEFFFullName,Phone,NationalId,Blood\nنورة القحطاني,+966501112233,1099112233,A+\n';
    await page.locator('input[type="file"]').setInputFiles({
      name: 'valid-patients.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(validCsv, 'utf8'),
    });
    await expect(page.getByText('نورة القحطاني')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Commit Records' }).click();
    await expect(page.getByText('Successfully imported 1 patient records into clinic database!')).toBeVisible();

    // Scenario 12: Malformed / duplicate CSV import displays per-row error reporting
    const invalidCsv = 'FullName,Phone,NationalId,Blood\n,+966500000099,1099000099,O+\nDuplicate User,+966501112233,1099112233,B+\n';
    await page.locator('input[type="file"]').setInputFiles({
      name: 'invalid-patients.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(invalidCsv, 'utf8'),
    });
    await page.getByRole('button', { name: 'Confirm & Commit Records' }).click();
    await expect(page.getByText(/Partial or failed import: 0 succeeded, 2 failed/)).toBeVisible();
    await expect(page.getByText(/Missing required fields/)).toBeVisible();
    await expect(page.getByText(/Duplicate patient record for NationalId: 1099112233/)).toBeVisible();

    // Scenario 13: UTF-8 BOM CSV export download check
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export Patients Roster/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^MediCore_Patients_NOK_.*\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const rawBytes = Buffer.concat(chunks);
    // Verify UTF-8 BOM (EF BB BF) + exported Arabic patient name
    expect(rawBytes[0]).toBe(0xef);
    expect(rawBytes[1]).toBe(0xbb);
    expect(rawBytes[2]).toBe(0xbf);
    const csvContent = rawBytes.toString('utf8');
    expect(csvContent).toContain('نورة القحطاني');
    expect(csvContent).toContain('سالم الحربي');
  });
});
