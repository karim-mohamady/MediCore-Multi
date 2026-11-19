import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, ShieldCheck, Copy, Check, LogIn, LogOut, AlertCircle } from 'lucide-react';
import { isEmulatorMode, isFirebaseConfigured, isStagingLocked, envEvaluation } from '../lib/firebase';

interface FirebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseModal: React.FC<FirebaseModalProps> = ({ isOpen, onClose }) => {
  const {
    language,
    isDemoMode,
    setIsDemoMode,
    authUser,
    currentUser,
    currentRole,
    currentClinicId,
    liveLoading,
    liveError,
    signInLive,
    signOutLive,
  } = useApp();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'rules' | 'env'>('status');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const FIRESTORE_RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }

    function isActiveAccount() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('status', 'active') == 'active';
    }

    match /clinics/{clinicId} {
      match /patients/{patientId} {
        allow read: if isAnyTenantStaff(clinicId) || isPatientOwner(clinicId, patientId);
        allow create, update: if isReceptionistOrStaff(clinicId) && validTenantOnCreate(clinicId);
        allow delete: if false;
      }
      match /patientClinicalRecords/{patientId} {
        allow read: if isClinicalStaff(clinicId) || isPatientOwner(clinicId, patientId);
        allow create, update: if isClinicalStaff(clinicId) && validTenantOnCreate(clinicId);
        allow delete: if false;
      }
      match /appointmentSlots/{slotId} {
        allow create: if isValidId(slotId) && !exists(.../appointmentSlots/$(slotId));
        allow update: if validTenantOnUpdate(clinicId) && (reserved -> cancelled || cancelled -> reserved);
        allow delete: if false;
      }
      match /queues/{queueId} {
        allow read: if isAnyTenantStaff(clinicId) || isPatientOwner(clinicId, resource.data.patientId);
        allow create, update: if isReceptionistOrStaff(clinicId) || isDoctor(clinicId);
      }
      match /invoices/{invoiceId} {
        allow create: if request.resource.data.get('paidAmount', 0) == 0;
        allow update: if isAccountantOrAdmin(clinicId) && resource.data.paymentStatus != 'paid'
          && request.resource.data.paidAmount <= resource.data.totalAmount;
        allow delete: if false;
        match /payments/{paymentId} {
          allow create: if !exists(.../payments/$(paymentId)) &&
            getAfter(.../invoices/$(invoiceId)).data.paidAmount ==
            get(.../invoices/$(invoiceId)).data.paidAmount + request.resource.data.amount;
          allow update, delete: if false;
        }
      }
    }
  }
}`;

  const handleCopyRules = () => {
    navigator.clipboard.writeText(FIRESTORE_RULES_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLiveSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMsg(null);
    try {
      await signInLive(email, password);
      setPassword('');
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const configured = isFirebaseConfigured();
  const emulatorActive = isEmulatorMode();
  const stagingLocked = isStagingLocked();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {language === 'ar' ? 'إعدادات وأمان Firebase Cloud Firestore' : 'Firebase Security & Connection Center'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {language === 'ar' ? 'العزل المنطقي للمستأجرين وقواعد الحماية المعتمدة' : 'Multi-Tenant Isolation & Hardened Rules'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/30 px-6 gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'status'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {language === 'ar' ? 'حالة الاتصال والمصادقة' : 'Connection & Auth'}
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`py-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'rules'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {language === 'ar' ? 'قواعد الأمان (firestore.rules)' : 'Security Rules (firestore.rules)'}
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`py-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'env'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {language === 'ar' ? 'متغيرات البيئة (.env)' : 'Environment Variables (.env)'}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'status' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white block text-sm mb-1">
                    {language === 'ar' ? 'نمط التشغيل الحالي:' : 'Current Execution Mode:'}
                  </span>
                  <p className="text-slate-500 dark:text-slate-400">
                    {isDemoMode
                      ? (language === 'ar'
                          ? 'الوضع التجريبي النشط (بيانات اصطناعية كاملة معزولة لكل عيادة)'
                          : 'Interactive Demo Mode (Preloaded realistic clinics and queues)')
                      : emulatorActive
                      ? (language === 'ar' ? 'وضع محاكي Firebase المحلي (Auth + Firestore Emulator)' : 'Live Local Firebase Emulator Mode')
                      : configured
                      ? (language === 'ar'
                          ? `متصل بمشروع Firebase Staging: ${envEvaluation.projectId}`
                          : `Connected to Live Firebase Staging Project: ${envEvaluation.projectId}`)
                      : (language === 'ar' ? 'إعدادات Firebase غير مكتملة أو غير صالحة' : 'Firebase credentials missing or invalid')}
                  </p>
                </div>
                <button
                  disabled={!isDemoMode && stagingLocked}
                  onClick={() => setIsDemoMode(!isDemoMode)}
                  className={`px-4 py-2 rounded-lg font-semibold cursor-pointer transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isDemoMode
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {isDemoMode
                    ? (language === 'ar' ? 'تبديل إلى Live Firebase' : 'Switch to Live Firebase')
                    : stagingLocked
                    ? (language === 'ar' ? 'بيئة Staging مقفلة' : 'Staging Locked')
                    : (language === 'ar' ? 'تبديل إلى الوضع التجريبي' : 'Switch to Demo Mode')}
                </button>
              </div>

              {(envEvaluation.errors.length > 0 || envEvaluation.warnings.length > 0) && (
                <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 space-y-1.5 text-[11px]">
                  <div className="font-semibold text-amber-900 dark:text-amber-300">
                    {language === 'ar' ? 'تشخيص تهيئة البيئة:' : 'Environment Configuration Diagnostics:'}
                  </div>
                  {envEvaluation.errors.map((errMsg, idx) => (
                    <div key={`err-${idx}`} className="text-red-700 dark:text-red-300">
                      • {errMsg}
                    </div>
                  ))}
                  {envEvaluation.warnings.map((warnMsg, idx) => (
                    <div key={`warn-${idx}`} className="text-amber-800 dark:text-amber-200">
                      • {warnMsg}
                    </div>
                  ))}
                </div>
              )}

              {!isDemoMode && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {language === 'ar' ? 'مصادقة Firebase الحية' : 'Live Firebase Authentication'}
                    </span>
                    {authUser && (
                      <button
                        onClick={signOutLive}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
                      </button>
                    )}
                  </div>

                  {(authMsg || liveError) && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{authMsg || liveError}</span>
                    </div>
                  )}

                  {authUser ? (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1 font-mono text-[11px]">
                      <div>UID: {authUser.uid}</div>
                      <div>Email: {authUser.email}</div>
                      <div>Authoritative Role: {currentRole}</div>
                      <div>Tenant Clinic: {currentClinicId}</div>
                      <div>Profile Name: {currentUser.name}</div>
                    </div>
                  ) : (
                    <form onSubmit={handleLiveSignIn} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="staff@clinic.com"
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={liveLoading || !configured}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'دخول آمن' : 'Sign In'}</span>
                      </button>
                    </form>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                  {language === 'ar' ? 'ضمانات العزل المتعدد للمستأجرين (Multi-Tenancy Guard):' : 'Tenant Isolation Architecture Guarantees:'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800">
                    <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
                      ✓ Logical Firestore Partitioning
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      كل سجل معزول داخل `/clinics/&#123;clinicId&#125;/...` مع التحقق من الصلاحية في القواعد.
                    </span>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800">
                    <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
                      ✓ Role & PHI Confidentiality
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      فصل السجلات السريرية والمخبرية عن الاستقبال والمحاسبة ومدير العيادة غير السريري.
                    </span>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800">
                    <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
                      ✓ Atomic Ledger & getAfter() Coupling
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      منع السداد الزائد وإلزام تطابق سندات القبض غير القابلة للتعديل مع رصيد الفاتورة.
                    </span>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800">
                    <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
                      ✓ Firebase Spark (Free-Tier) Compatible
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      متوافق مع الخطة المجانية والمحاكي المحلي مع توثيق حدود التحقق الخادمي.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  firestore.rules (Tenant-Scoped Canonical Rules)
                </span>
                <button
                  onClick={handleCopyRules}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? (language === 'ar' ? 'تم النسخ' : 'Copied!') : (language === 'ar' ? 'نسخ القواعد' : 'Copy Rules')}</span>
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800 max-h-72">
                {FIRESTORE_RULES_SNIPPET}
              </pre>
            </div>
          )}

          {activeTab === 'env' && (
            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                {language === 'ar'
                  ? 'للربط بمشروعك الحي في Firebase Console أو بالمحاكي المحلي، استخدم المتغيرات التالية في .env:'
                  : 'To connect to your live Firebase Console project or local Emulator Suite, set these .env variables:'}
              </p>
              <pre className="p-4 rounded-xl bg-slate-950 text-amber-300 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
{`# Deployment tier: demo | emulator | staging
VITE_MEDICORE_ENV="staging"

# Firebase Web SDK Configuration (replace with dedicated Staging project values)
VITE_FIREBASE_API_KEY="MY_STAGING_FIREBASE_API_KEY"
VITE_FIREBASE_AUTH_DOMAIN="MY_STAGING_PROJECT_ID.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="MY_STAGING_PROJECT_ID"
VITE_FIREBASE_STORAGE_BUCKET="MY_STAGING_PROJECT_ID.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="MY_MESSAGING_SENDER_ID"
VITE_FIREBASE_APP_ID="MY_STAGING_APP_ID"

# Disable Emulator Suite when connecting to Staging
VITE_USE_FIREBASE_EMULATOR="false"`}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors cursor-pointer"
          >
            {language === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

