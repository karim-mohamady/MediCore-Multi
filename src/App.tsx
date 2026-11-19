/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { RoleBanner } from './components/RoleBanner';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { canAccessView, getDefaultViewForRole } from './lib/permissions';

// Lazy-loaded Modals (mounted only when opened)
const OnboardingModal = lazy(() =>
  import('./components/OnboardingModal').then((m) => ({ default: m.OnboardingModal }))
);
const TVQueueModal = lazy(() =>
  import('./components/TVQueueModal').then((m) => ({ default: m.TVQueueModal }))
);
const AIAssistantModal = lazy(() =>
  import('./components/AIAssistantModal').then((m) => ({ default: m.AIAssistantModal }))
);
const FirebaseModal = lazy(() =>
  import('./components/FirebaseModal').then((m) => ({ default: m.FirebaseModal }))
);
const NewAppointmentModal = lazy(() =>
  import('./components/NewAppointmentModal').then((m) => ({ default: m.NewAppointmentModal }))
);
const NewPatientModal = lazy(() =>
  import('./components/NewPatientModal').then((m) => ({ default: m.NewPatientModal }))
);
const NewInvoiceModal = lazy(() =>
  import('./components/NewInvoiceModal').then((m) => ({ default: m.NewInvoiceModal }))
);

// Lazy-loaded Route Views
const DashboardView = lazy(() =>
  import('./views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const QueueView = lazy(() =>
  import('./views/QueueView').then((m) => ({ default: m.QueueView }))
);
const AppointmentsView = lazy(() =>
  import('./views/AppointmentsView').then((m) => ({ default: m.AppointmentsView }))
);
const PatientsView = lazy(() =>
  import('./views/PatientsView').then((m) => ({ default: m.PatientsView }))
);
const DoctorWorkspaceView = lazy(() =>
  import('./views/DoctorWorkspaceView').then((m) => ({ default: m.DoctorWorkspaceView }))
);
const BillingLedgerView = lazy(() =>
  import('./views/BillingLedgerView').then((m) => ({ default: m.BillingLedgerView }))
);
const PatientPortalView = lazy(() =>
  import('./views/PatientPortalView').then((m) => ({ default: m.PatientPortalView }))
);
const SuperAdminView = lazy(() =>
  import('./views/SuperAdminView').then((m) => ({ default: m.SuperAdminView }))
);
const ExcelDataView = lazy(() =>
  import('./views/ExcelDataView').then((m) => ({ default: m.ExcelDataView }))
);
const LandingPageView = lazy(() =>
  import('./views/LandingPageView').then((m) => ({ default: m.LandingPageView }))
);

const ViewLoadingFallback: React.FC<{ language: 'ar' | 'en' }> = ({ language }) => (
  <div
    role="status"
    className="flex flex-col items-center justify-center min-h-[260px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 gap-3"
  >
    <div className="w-7 h-7 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
      {language === 'ar' ? 'جاري تحميل مساحة العمل...' : 'Loading workspace module...'}
    </span>
  </div>
);

function MainApp() {
  const { currentRole, language } = useApp();

  const [activeView, setActiveView] = useState<string>(() => getDefaultViewForRole(currentRole));
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Modals state
  const [isAIModalOpen, setIsAIModalOpen] = useState<boolean>(false);
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isTVQueueOpen, setIsTVQueueOpen] = useState<boolean>(false);
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState<boolean>(false);
  const [isNewPatientOpen, setIsNewPatientOpen] = useState<boolean>(false);
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState<boolean>(false);

  // Auto-switch view when role changes or current view is outside role permissions
  React.useEffect(() => {
    if (currentRole === 'patient') {
      if (activeView !== 'patient-portal' && activeView !== 'landing') {
        setActiveView('patient-portal');
      }
    } else if (currentRole === 'super_admin') {
      if (!canAccessView(currentRole, activeView) || activeView === 'dashboard') {
        setActiveView('super-admin');
      }
    } else if (!canAccessView(currentRole, activeView) || activeView === 'patient-portal' || activeView === 'super-admin') {
      setActiveView(getDefaultViewForRole(currentRole));
    }
  }, [currentRole, activeView]);

  const isViewAuthorized = canAccessView(currentRole, activeView);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* 1. Tenant & Role Switcher Banner for rapid testing */}
      <RoleBanner />

      {/* 2. Top Bar Contract Header */}
      <Header
        onOpenAI={() => setIsAIModalOpen(true)}
        onOpenFirebase={() => setIsFirebaseModalOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        activeView={activeView}
        setActiveView={setActiveView}
      />

      {/* 3. Main Workspace Container */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Collapsible Sidebar (Desktop) */}
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          onOpenTV={() => setIsTVQueueOpen(true)}
        />

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 pb-20 md:pb-8 overflow-x-hidden min-w-0">
          <Suspense fallback={<ViewLoadingFallback language={language} />}>
            {!isViewAuthorized && (
              <div
                role="alert"
                className="rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 p-8 text-center space-y-3"
              >
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                  {language === 'ar'
                    ? 'غير مصرح لهذا الدور بالوصول إلى هذه الصفحة'
                    : 'This role is not authorized to access the requested workspace view.'}
                </p>
                <button
                  onClick={() => setActiveView(getDefaultViewForRole(currentRole))}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 cursor-pointer"
                >
                  {language === 'ar' ? 'العودة إلى المساحة الافتراضية' : 'Return to Authorized Workspace'}
                </button>
              </div>
            )}

            {isViewAuthorized && activeView === 'landing' && (
              <LandingPageView
                onOpenOnboarding={() => setIsOnboardingOpen(true)}
                onEnterDashboard={() => setActiveView(getDefaultViewForRole(currentRole))}
                onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
              />
            )}

            {isViewAuthorized && activeView === 'dashboard' && (
              <DashboardView
                onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
                onOpenNewPatient={() => setIsNewPatientOpen(true)}
                onOpenNewInvoice={() => setIsNewInvoiceOpen(true)}
                onOpenTV={() => setIsTVQueueOpen(true)}
                setActiveView={setActiveView}
              />
            )}

            {isViewAuthorized && activeView === 'queue' && (
              <QueueView
                onOpenTV={() => setIsTVQueueOpen(true)}
                onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
              />
            )}

            {isViewAuthorized && activeView === 'appointments' && (
              <AppointmentsView
                onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
              />
            )}

            {isViewAuthorized && activeView === 'patients' && (
              <PatientsView
                onOpenNewPatient={() => setIsNewPatientOpen(true)}
                onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
              />
            )}

            {isViewAuthorized && activeView === 'doctor-room' && <DoctorWorkspaceView />}

            {isViewAuthorized && activeView === 'billing' && (
              <BillingLedgerView onOpenNewInvoice={() => setIsNewInvoiceOpen(true)} />
            )}

            {isViewAuthorized && activeView === 'patient-portal' && (
              <PatientPortalView onOpenNewAppointment={() => setIsNewAppointmentOpen(true)} />
            )}

            {isViewAuthorized && activeView === 'super-admin' && (
              <SuperAdminView onOpenOnboarding={() => setIsOnboardingOpen(true)} />
            )}

            {isViewAuthorized && activeView === 'excel' && <ExcelDataView />}
          </Suspense>
        </main>
      </div>

      {/* 4. Mobile Bottom Navigation */}
      <BottomNav activeView={activeView} setActiveView={setActiveView} />

      {/* 5. Lazy Modals */}
      <Suspense fallback={null}>
        {isOnboardingOpen && (
          <OnboardingModal
            isOpen={isOnboardingOpen}
            onClose={() => setIsOnboardingOpen(false)}
          />
        )}

        {isTVQueueOpen && (
          <TVQueueModal
            isOpen={isTVQueueOpen}
            onClose={() => setIsTVQueueOpen(false)}
          />
        )}

        {isAIModalOpen && (
          <AIAssistantModal
            isOpen={isAIModalOpen}
            onClose={() => setIsAIModalOpen(false)}
          />
        )}

        {isFirebaseModalOpen && (
          <FirebaseModal
            isOpen={isFirebaseModalOpen}
            onClose={() => setIsFirebaseModalOpen(false)}
          />
        )}

        {isNewAppointmentOpen && (
          <NewAppointmentModal
            isOpen={isNewAppointmentOpen}
            onClose={() => setIsNewAppointmentOpen(false)}
          />
        )}

        {isNewPatientOpen && (
          <NewPatientModal
            isOpen={isNewPatientOpen}
            onClose={() => setIsNewPatientOpen(false)}
          />
        )}

        {isNewInvoiceOpen && (
          <NewInvoiceModal
            isOpen={isNewInvoiceOpen}
            onClose={() => setIsNewInvoiceOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
