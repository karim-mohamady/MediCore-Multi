import React from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldAlert,
  Building2,
  Users,
  Activity,
  CheckCircle2,
  AlertOctagon,
  Sparkles,
} from 'lucide-react';

interface SuperAdminViewProps {
  onOpenOnboarding: () => void;
}

export const SuperAdminView: React.FC<SuperAdminViewProps> = ({ onOpenOnboarding }) => {
  const { language, clinics, users, patients, appointments } = useApp();

  const totalClinics = clinics.length;
  const activeClinics = clinics.filter(c => c.status === 'active').length;
  const totalUsers = users.length;
  const totalPatients = patients.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {language === 'ar' ? 'لوحة القيادة المركزية لمالك المنصة (Super Admin)' : 'Super Admin Platform Control Plane'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'ar'
                ? 'مراقبة كافة المنشآت الطبية، المستأجرين (Tenants)، وتوزيع الأحمال وقواعد الأمان'
                : 'Global multi-tenant governance, subscription statuses & infrastructure health'}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenOnboarding}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-purple-700 hover:bg-purple-800 text-white transition-colors cursor-pointer shadow-xs"
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>{language === 'ar' ? 'إضافة منشأة طبية' : 'Provision New Tenant'}</span>
        </button>
      </div>

      {/* Global Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-400 block mb-0.5">{language === 'ar' ? 'إجمالي العيادات والمراكز' : 'Total Tenants'}</span>
          <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">{totalClinics}</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-400 block mb-0.5">{language === 'ar' ? 'الاشتراكات النشطة' : 'Active Clinics'}</span>
          <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{activeClinics}</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-400 block mb-0.5">{language === 'ar' ? 'طاقم العمل المسجل' : 'Staff Users'}</span>
          <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">{totalUsers}</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-400 block mb-0.5">{language === 'ar' ? 'إجمالي ملفات المرضى' : 'Total EHR Records'}</span>
          <span className="text-2xl font-bold font-mono text-teal-600 dark:text-teal-400">{totalPatients}</span>
        </div>
      </div>

      {/* Clinics Directory */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs space-y-3 p-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
          {language === 'ar' ? 'دليل المنشآت الطبية المسجلة على المنصة' : 'Registered Healthcare Facilities'}
        </h3>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {clinics.map(clinic => (
            <div key={clinic.id} className="py-4 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-mono font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {clinic.code}
                </div>
                <div>
                  <span className="font-bold text-slate-900 dark:text-white text-sm block">
                    {language === 'ar' ? clinic.nameAr : clinic.name}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {clinic.id} · {clinic.specialty} · {clinic.city}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  {clinic.plan}
                </span>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    clinic.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {clinic.status}
                </span>

                <span className="text-slate-400 font-mono text-[11px]">
                  {clinic.branches.length} {language === 'ar' ? 'فروع' : 'branches'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
