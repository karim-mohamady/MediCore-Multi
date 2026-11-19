import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { hasRolePermission } from '../lib/permissions';
import {
  Users,
  Clock,
  CalendarCheck2,
  Activity,
  CheckCircle2,
  TrendingUp,
  UserPlus,
  PlusCircle,
  Receipt,
  Tv,
  PhoneCall,
  ArrowRight,
  ArrowLeft,
  Volume2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface DashboardViewProps {
  onOpenNewAppointment: () => void;
  onOpenNewPatient: () => void;
  onOpenNewInvoice: () => void;
  onOpenTV: () => void;
  setActiveView: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenNewAppointment,
  onOpenNewPatient,
  onOpenNewInvoice,
  onOpenTV,
  setActiveView,
}) => {
  const {
    t,
    language,
    currentClinic,
    currentRole,
    appointments,
    queues,
    invoices,
    callNextQueueTicket,
    getWhatsAppUrl,
  } = useApp();

  const canEnrollPatients = hasRolePermission(currentRole, 'canEnrollPatients');
  const canScheduleAppointments = hasRolePermission(currentRole, 'canScheduleAppointments');
  const canIssueInvoices = hasRolePermission(currentRole, 'canIssueInvoices');
  const canManageQueue = hasRolePermission(currentRole, 'canManageQueue');

  const [isCallingNext, setIsCallingNext] = useState(false);
  const callInFlightRef = useRef(false);
  const [queueFeedback, setQueueFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  const handleQuickCallNext = async () => {
    if (callInFlightRef.current || isCallingNext) return;
    callInFlightRef.current = true;
    setIsCallingNext(true);
    setQueueFeedback(null);
    try {
      const called = await callNextQueueTicket();
      if (!called) {
        setQueueFeedback({
          type: 'info',
          message:
            language === 'ar'
              ? 'لا يوجد مرضى في قائمة الانتظار حالياً.'
              : 'No patients are currently waiting in the queue.',
        });
      } else {
        setQueueFeedback({
          type: 'success',
          message:
            language === 'ar'
              ? `تم نداء المريض ${called.patientName} (تذكرة ${called.tokenNumber}).`
              : `Called ${called.patientName} (Token ${called.tokenNumber}).`,
        });
      }
    } catch (err) {
      setQueueFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      callInFlightRef.current = false;
      setIsCallingNext(false);
    }
  };

  const clinicApts = appointments.filter(a => a.clinicId === currentClinic.id);
  const clinicQueues = queues.filter(q => q.clinicId === currentClinic.id);
  const clinicInvoices = invoices.filter(i => i.clinicId === currentClinic.id);

  // Metrics
  const expectedToday = clinicApts.length;
  const arrivedToday = clinicApts.filter(a => a.status === 'arrived' || a.status === 'in_consultation' || a.status === 'completed').length;
  const inWaiting = clinicQueues.filter(q => q.status === 'waiting').length;
  const inConsultation = clinicQueues.filter(q => q.status === 'in_room' || q.status === 'called').length;
  const completedToday = clinicApts.filter(a => a.status === 'completed').length;
  const revenueToday = clinicInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

  const kpis = [
    {
      label: t.kpiExpected,
      value: expectedToday,
      icon: CalendarCheck2,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      border: 'border-blue-100 dark:border-blue-900/40',
    },
    {
      label: t.kpiArrived,
      value: arrivedToday,
      icon: Users,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      border: 'border-indigo-100 dark:border-indigo-900/40',
    },
    {
      label: t.kpiWaiting,
      value: inWaiting,
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-100 dark:border-amber-900/40',
    },
    {
      label: t.kpiInConsultation,
      value: inConsultation,
      icon: Activity,
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-950/40',
      border: 'border-teal-100 dark:border-teal-900/40',
    },
    {
      label: t.kpiCompleted,
      value: completedToday,
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-100 dark:border-emerald-900/40',
    },
    {
      label: t.kpiRevenueToday,
      value: `${revenueToday.toLocaleString()} SAR`,
      icon: TrendingUp,
      color: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-950/40',
      border: 'border-sky-100 dark:border-sky-900/40',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {language === 'ar' ? 'مؤشرات الأداء التشغيلي والعيادات' : 'Clinic Operational Overview'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'ar'
              ? `مرحباً بك في لوحة تحكم ${currentClinic.nameAr} · ${currentClinic.branches[0]?.nameAr || 'الفرع الرئيسي'}`
              : `Welcome to ${currentClinic.name} · ${currentClinic.branches[0]?.name || 'Main Branch'}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canEnrollPatients && (
            <button
              onClick={onOpenNewPatient}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t.btnNewPatient}</span>
            </button>
          )}
          {canScheduleAppointments && (
            <button
              onClick={onOpenNewAppointment}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors cursor-pointer shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{t.btnBookAppointment}</span>
            </button>
          )}
          {canIssueInvoices && (
            <button
              onClick={onOpenNewInvoice}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5 text-teal-600" />
              <span>{t.btnIssueInvoice}</span>
            </button>
          )}
          <button
            onClick={onOpenTV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Tv className="w-3.5 h-3.5 text-teal-400" />
            <span>{t.btnOpenWaitingTV}</span>
          </button>
        </div>
      </div>

      {/* KPI 6-Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`p-4 rounded-xl border bg-white dark:bg-slate-900 ${kpi.border} shadow-xs flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {kpi.label}
                </span>
                <div className={`p-1.5 rounded-lg ${kpi.bg} ${kpi.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
                {kpi.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2-Column Split: Live Waiting Room vs Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Waiting Room Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {language === 'ar' ? 'حالة صالة الانتظار الحالية' : 'Live Waiting Queue Stream'}
                </h3>
                <span className="text-[11px] text-slate-400">
                  {inWaiting} {language === 'ar' ? 'مرضى في الانتظار' : 'patients waiting'}
                </span>
              </div>
            </div>

            {canManageQueue && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleQuickCallNext}
                  disabled={isCallingNext}
                  aria-busy={isCallingNext}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer shadow-xs"
                >
                  {isCallingNext ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isCallingNext
                      ? (language === 'ar' ? 'جاري النداء...' : 'Calling...')
                      : t.btnCallNext}
                  </span>
                </button>
              </div>
            )}
          </div>

          {queueFeedback && (
            <div
              role="status"
              className={`mb-3 p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                queueFeedback.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : queueFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {queueFeedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : queueFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 shrink-0" />
                )}
                <span>{queueFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setQueueFeedback(null)}
                className="text-[11px] font-semibold underline cursor-pointer shrink-0"
              >
                {language === 'ar' ? 'إغلاق' : 'Dismiss'}
              </button>
            </div>
          )}

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-80">
            {clinicQueues.slice(0, 5).map(q => (
              <div
                key={q.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-extrabold text-sm text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-xs">
                    {q.tokenNumber}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {q.patientName}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {q.doctorName}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      q.status === 'in_room'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : q.status === 'called'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {q.status === 'in_room' ? t.statusInRoom : q.status === 'called' ? t.statusCalled : t.statusWaiting}
                  </span>

                  <a
                    href={getWhatsAppUrl(q)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800"
                    title={t.btnSendWhatsApp}
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}

            {clinicQueues.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                {language === 'ar' ? 'لا توجد أرقام دور في الطابور حالياً' : 'No patients currently in queue'}
              </div>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              onClick={() => setActiveView('queue')}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{language === 'ar' ? 'فتح صالة الانتظار الكاملة' : 'View Full Queue Manager'}</span>
              {language === 'ar' ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Today's Scheduled Appointments */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                <CalendarCheck2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {language === 'ar' ? 'مواعيد اليوم المجدولة' : "Today's Appointment Schedule"}
                </h3>
                <span className="text-[11px] text-slate-400">
                  {clinicApts.length} {language === 'ar' ? 'مواعيد مسجلة اليوم' : 'total today'}
                </span>
              </div>
            </div>

            {canScheduleAppointments && (
              <button
                onClick={onOpenNewAppointment}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 hover:bg-blue-100 transition-colors cursor-pointer"
              >
                + {t.btnBookAppointment}
              </button>
            )}
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-80">
            {clinicApts.slice(0, 5).map(a => (
              <div
                key={a.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="text-center w-12 font-mono">
                    <span className="font-bold text-slate-900 dark:text-white block text-sm">
                      {a.timeSlot}
                    </span>
                    <span className="text-[10px] text-slate-400">{a.durationMin}m</span>
                  </div>
                  <div className="border-l rtl:border-l-0 rtl:border-r border-slate-200 dark:border-slate-700 pl-3 rtl:pl-0 rtl:pr-3">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {a.patientName}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {a.doctorName} · {a.type}
                    </span>
                  </div>
                </div>

                <div className="text-right rtl:text-left">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      a.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : a.status === 'in_consultation'
                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                        : a.status === 'arrived'
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {a.status}
                  </span>
                  <span className="block text-[11px] font-mono text-slate-400 mt-0.5">
                    {a.fee} SAR
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              onClick={() => setActiveView('appointments')}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{language === 'ar' ? 'عرض التقويم الكامل' : 'Open Full Schedule'}</span>
              {language === 'ar' ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
