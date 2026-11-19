import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { hasRolePermission } from '../lib/permissions';
import {
  CalendarDays,
  PlusCircle,
  Clock,
  User,
  Filter,
  AlertCircle,
  CalendarClock,
} from 'lucide-react';

interface AppointmentsViewProps {
  onOpenNewAppointment: () => void;
}

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({ onOpenNewAppointment }) => {
  const {
    t,
    language,
    currentClinic,
    currentRole,
    appointments,
    users,
    checkInPatient,
    updateAppointmentStatus,
    rescheduleAppointment,
  } = useApp();

  const canScheduleAppointments = hasRolePermission(currentRole, 'canScheduleAppointments');
  const canManageQueue = hasRolePermission(currentRole, 'canManageQueue');

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'list'>('day');
  const [actionError, setActionError] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('09:00');
  const [busyId, setBusyId] = useState<string | null>(null);

  const doctors = users.filter(
    u => u.clinicId === currentClinic.id && (u.role === 'doctor' || u.role === 'clinic_owner')
  );

  const clinicApts = appointments.filter(a => {
    if (a.clinicId !== currentClinic.id) return false;
    const matchesDoc = selectedDoctorId === 'all' || a.doctorId === selectedDoctorId;
    const matchesStatus = selectedStatus === 'all' || a.status === selectedStatus;
    return matchesDoc && matchesStatus;
  });

  const handleCheckIn = async (aptId: string) => {
    setActionError(null);
    setBusyId(aptId);
    try {
      await checkInPatient(aptId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (aptId: string) => {
    setActionError(null);
    setBusyId(aptId);
    try {
      await updateAppointmentStatus(aptId, 'cancelled');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenReschedule = (aptId: string, date: string, timeSlot: string) => {
    setActionError(null);
    setReschedulingId(aptId);
    setRescheduleDate(date);
    setRescheduleTime(timeSlot);
  };

  const handleConfirmReschedule = async (aptId: string) => {
    if (!rescheduleDate || !rescheduleTime) return;
    setActionError(null);
    setBusyId(aptId);
    try {
      const res = await rescheduleAppointment(aptId, rescheduleDate, rescheduleTime);
      if (!res.success) {
        setActionError(res.message || 'Reschedule failed');
      } else {
        setReschedulingId(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t.appointmentsTitle}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {clinicApts.length} {language === 'ar' ? 'مواعيد مسجلة في هذا العرض' : 'appointments listed in view'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Day / Week / List segmented switch */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'day' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.viewDay}
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'week' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.viewWeek}
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.viewList}
            </button>
          </div>

          {canScheduleAppointments && (
            <button
              onClick={onOpenNewAppointment}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors cursor-pointer shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{t.btnBookAppointment}</span>
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="underline text-[11px] cursor-pointer">
            {language === 'ar' ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-slate-500 font-medium">{t.filterByDoctor}:</span>
          <select
            value={selectedDoctorId}
            onChange={e => setSelectedDoctorId(e.target.value)}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
          >
            <option value="all">{language === 'ar' ? 'جميع الأطباء' : 'All Doctors'}</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">{language === 'ar' ? 'حسب الحالة:' : 'Status:'}</span>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
          >
            <option value="all">{language === 'ar' ? 'الكل' : 'All'}</option>
            <option value="scheduled">{language === 'ar' ? 'مجدول' : 'Scheduled'}</option>
            <option value="arrived">{language === 'ar' ? 'حضر للعيادة' : 'Arrived'}</option>
            <option value="in_consultation">{language === 'ar' ? 'قيد الكشف' : 'In Consultation'}</option>
            <option value="completed">{language === 'ar' ? 'مكتمل' : 'Completed'}</option>
            <option value="cancelled">{language === 'ar' ? 'ملغي' : 'Cancelled'}</option>
          </select>
        </div>
      </div>

      {/* Appointments List / Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clinicApts.map(apt => (
          <div
            key={apt.id}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-sm block">
                  {apt.patientName}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {apt.patientPhone}
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  apt.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : apt.status === 'in_consultation'
                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                    : apt.status === 'arrived'
                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                    : apt.status === 'cancelled'
                    ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                }`}
              >
                {apt.status}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono font-bold">{apt.date} · {apt.timeSlot}</span>
                  <span className="text-[10px] text-slate-400">({apt.durationMin}m)</span>
                </span>
                <span className="font-mono font-semibold text-teal-600 dark:text-teal-400">{apt.fee} SAR</span>
              </div>

              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium truncate">{apt.doctorName}</span>
              </div>

              {apt.notes && (
                <p className="text-[11px] text-slate-500 italic border-t border-slate-200/60 dark:border-slate-700/60 pt-1 mt-1 truncate">
                  "{apt.notes}"
                </p>
              )}
            </div>

            {reschedulingId === apt.id && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-2 text-xs">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={e => setRescheduleDate(e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <input
                    type="time"
                    value={rescheduleTime}
                    onChange={e => setRescheduleTime(e.target.value)}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setReschedulingId(null)}
                    className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Close'}
                  </button>
                  <button
                    disabled={busyId === apt.id}
                    onClick={() => handleConfirmReschedule(apt.id)}
                    className="px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    {language === 'ar' ? 'حفظ الموعد' : 'Save Slot'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 text-xs gap-2">
              {apt.queueToken ? (
                <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400 font-bold">
                  {t.tokenNumber}: {apt.queueToken}
                </span>
              ) : canManageQueue && apt.status !== 'cancelled' && apt.status !== 'completed' ? (
                <button
                  disabled={busyId === apt.id}
                  onClick={() => handleCheckIn(apt.id)}
                  className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium cursor-pointer shadow-xs"
                >
                  {language === 'ar' ? 'تسجيل حضور وإصدار دور' : 'Check In Now'}
                </button>
              ) : (
                <span />
              )}

              {canScheduleAppointments && (apt.status === 'scheduled' || apt.status === 'confirmed') && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={busyId === apt.id}
                    onClick={() => handleOpenReschedule(apt.id, apt.date, apt.timeSlot)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 text-[11px] cursor-pointer"
                  >
                    <CalendarClock className="w-3 h-3" />
                    <span>{language === 'ar' ? 'إعادة جدولة' : 'Reschedule'}</span>
                  </button>
                  <button
                    disabled={busyId === apt.id}
                    onClick={() => handleCancel(apt.id)}
                    className="text-red-500 hover:text-red-700 disabled:opacity-50 text-[11px] cursor-pointer"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
