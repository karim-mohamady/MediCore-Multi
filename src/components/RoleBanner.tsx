import React from 'react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import { Shield, Sparkles, Building2, Lock, AlertTriangle } from 'lucide-react';
import { getExecutionEnvironmentMode, isEmulatorMode } from '../lib/firebase';

export const RoleBanner: React.FC = () => {
  const {
    currentRole,
    setCurrentRole,
    clinics,
    currentClinicId,
    setCurrentClinicId,
    language,
    isDemoMode,
    authUser,
    liveError,
    clearLiveError,
  } = useApp();

  const roles: { id: UserRole; labelAr: string; labelEn: string; iconText: string }[] = [
    { id: 'clinic_owner', labelAr: 'مالك العيادة', labelEn: 'Clinic Owner', iconText: '👑' },
    { id: 'clinic_manager', labelAr: 'مدير العيادة', labelEn: 'Manager', iconText: '🏢' },
    { id: 'doctor', labelAr: 'طبيب معالج', labelEn: 'Doctor', iconText: '🩺' },
    { id: 'receptionist', labelAr: 'موظف الاستقبال', labelEn: 'Reception', iconText: '🎫' },
    { id: 'nurse', labelAr: 'طاقم التمريض', labelEn: 'Nurse', iconText: '💉' },
    { id: 'accountant', labelAr: 'المحاسب', labelEn: 'Accountant', iconText: '💳' },
    { id: 'patient', labelAr: 'بوابة المريض', labelEn: 'Patient Portal', iconText: '📱' },
    { id: 'super_admin', labelAr: 'مدير المنصة', labelEn: 'Super Admin', iconText: '⚡' },
  ];

  const isLiveLocked = !isDemoMode;
  const envMode = getExecutionEnvironmentMode();
  const emulatorActive = isEmulatorMode();

  return (
    <div className="w-full">
      <aside aria-label="Tenant and role switcher" className="w-full bg-slate-900 text-slate-100 text-xs border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center gap-3 shrink-0">
          <span className={`flex items-center gap-1.5 font-semibold ${isDemoMode ? 'text-teal-400' : 'text-emerald-400'}`}>
            <Sparkles className="w-3.5 h-3.5" />
            {isDemoMode
              ? (language === 'ar' ? 'الوضع التجريبي الذكي' : 'Interactive Demo Mode')
              : (language === 'ar' ? 'اتصال Firebase حي (محمي)' : 'Live Firebase Mode (Enforced)')}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded font-mono text-[10px] uppercase tracking-wide border ${
              isDemoMode
                ? 'bg-teal-950/60 text-teal-300 border-teal-800'
                : emulatorActive
                ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                : envMode === 'staging'
                ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {isDemoMode ? 'DEMO' : emulatorActive ? 'EMULATOR' : 'STAGING'}
          </span>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">{language === 'ar' ? 'المنشأة:' : 'Tenant:'}</span>
            <select
              value={currentClinicId}
              disabled={isLiveLocked && currentRole !== 'super_admin'}
              onChange={(e) => setCurrentClinicId(e.target.value)}
              className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-teal-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {clinics.length === 0 ? (
                <option value="unassigned">{language === 'ar' ? 'لا توجد عيادة محملة' : 'No clinic loaded'}</option>
              ) : (
                clinics.map(c => (
                  <option key={c.id} value={c.id}>
                    {language === 'ar' ? c.nameAr : c.name} ({c.code})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400 flex items-center gap-1 mr-1">
            {isLiveLocked ? <Lock className="w-3 h-3 text-emerald-400" /> : <Shield className="w-3 h-3 text-amber-400" />}
            {isLiveLocked
              ? (language === 'ar' ? 'الصلاحية المعتمدة:' : 'Authoritative Role:')
              : (language === 'ar' ? 'تبديل الصلاحية:' : 'Role View:')}
          </span>
          {roles.map(r => {
            const isActive = currentRole === r.id;
            if (isLiveLocked && !isActive) return null;
            return (
              <button
                key={r.id}
                disabled={isLiveLocked}
                onClick={() => setCurrentRole(r.id)}
                className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap font-medium ${
                  isLiveLocked ? 'cursor-default' : 'cursor-pointer'
                } ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span className="mr-1">{r.iconText}</span>
                {language === 'ar' ? r.labelAr : r.labelEn}
                {isLiveLocked && authUser && (
                  <span className="ml-1.5 text-[10px] opacity-80 font-mono">({authUser.email})</span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {liveError && (
        <div role="alert" className="w-full bg-red-950/90 text-red-100 border-b border-red-800 px-4 py-2 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{liveError}</span>
          </div>
          <button
            onClick={clearLiveError}
            className="px-2 py-0.5 rounded bg-red-900 hover:bg-red-800 text-red-100 text-[11px] cursor-pointer"
          >
            {language === 'ar' ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}
    </div>
  );
};

