import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { hasRolePermission } from '../lib/permissions';
import {
  Clock,
  Volume2,
  Tv,
  PhoneCall,
  UserCheck,
  CheckCircle,
  Stethoscope,
  Filter,
  Search,
  AlertTriangle,
} from 'lucide-react';

interface QueueViewProps {
  onOpenTV: () => void;
  onOpenNewAppointment: () => void;
}

export const QueueView: React.FC<QueueViewProps> = ({ onOpenTV, onOpenNewAppointment }) => {
  const {
    t,
    language,
    currentClinic,
    currentRole,
    queues,
    appointments,
    users,
    callNextQueueTicket,
    updateQueueStatus,
    checkInPatient,
    getWhatsAppUrl,
  } = useApp();

  const canManageQueue = hasRolePermission(currentRole, 'canManageQueue');
  const canScheduleAppointments = hasRolePermission(currentRole, 'canScheduleAppointments');

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [queueError, setQueueError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<boolean>(false);

  const doctors = users.filter(
    u => u.clinicId === currentClinic.id && (u.role === 'doctor' || u.role === 'clinic_owner')
  );

  const clinicQueues = queues.filter(q => q.clinicId === currentClinic.id);
  const scheduledApts = appointments.filter(
    a => a.clinicId === currentClinic.id && a.status === 'scheduled'
  );

  const handleCallNext = async () => {
    setQueueError(null);
    setBusyAction(true);
    try {
      await callNextQueueTicket(selectedDoctorId === 'all' ? undefined : selectedDoctorId);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(false);
    }
  };

  const handleCheckIn = async (aptId: string) => {
    setQueueError(null);
    setBusyAction(true);
    try {
      await checkInPatient(aptId);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(false);
    }
  };

  const handleUpdateQueueStatus = async (ticketId: string, status: 'called' | 'in_room' | 'completed') => {
    setQueueError(null);
    setBusyAction(true);
    try {
      await updateQueueStatus(ticketId, status);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(false);
    }
  };

  const filteredQueues = clinicQueues.filter(q => {
    const matchesDoc = selectedDoctorId === 'all' || q.doctorId === selectedDoctorId;
    const matchesSearch =
      q.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.tokenNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.patientPhone.includes(searchQuery);
    return matchesDoc && matchesSearch;
  });

  const waitingCount = clinicQueues.filter(q => q.status === 'waiting').length;
  const inConsultCount = clinicQueues.filter(q => q.status === 'in_room' || q.status === 'called').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Fast Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t.queueTitle}
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t.queueSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canManageQueue && (
            <button
              disabled={busyAction}
              onClick={handleCallNext}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Volume2 className="w-4 h-4" />
              <span>{t.btnCallNext}</span>
            </button>
          )}

          <button
            onClick={onOpenTV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            <Tv className="w-4 h-4 text-teal-400" />
            <span>{t.btnOpenWaitingTV}</span>
          </button>
        </div>
      </div>

      {queueError && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{queueError}</span>
          </div>
          <button onClick={() => setQueueError(null)} className="underline text-[11px] cursor-pointer">
            {language === 'ar' ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Stats summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">{t.statusWaiting}</span>
            <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">{waitingCount}</span>
          </div>
          <span className="text-[11px] text-slate-400">
            ~{waitingCount * 15} {language === 'ar' ? 'دقيقة إجمالي' : 'min total'}
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">{t.kpiInConsultation}</span>
            <span className="text-2xl font-bold font-mono text-teal-600 dark:text-teal-400">{inConsultCount}</span>
          </div>
          <span className="text-[11px] text-slate-400">
            {language === 'ar' ? 'أطباء نشطون' : 'Active physicians'}
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">
              {language === 'ar' ? 'حجوزات تنتظر تسجيل الحضور' : 'Appointments Pending Check-In'}
            </span>
            <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">{scheduledApts.length}</span>
          </div>
          {canScheduleAppointments && (
            <button
              onClick={onOpenNewAppointment}
              className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              + {language === 'ar' ? 'حجز فوري' : 'Intake'}
            </button>
          )}
        </div>
      </div>

      {/* Fast Check-In Bar for Scheduled Patients */}
      {scheduledApts.length > 0 && (
        <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-blue-600" />
              {language === 'ar' ? 'تسجيل حضور سريع للمرضى المجدولين' : 'Quick Check-in for Scheduled Patients'}
            </span>
            <span className="text-[11px] text-blue-700 dark:text-blue-300 font-mono">
              {scheduledApts.length} {language === 'ar' ? 'في الانتظار للتحضير' : 'scheduled'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {scheduledApts.map(apt => (
              <div
                key={apt.id}
                className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">{apt.patientName}</span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {apt.timeSlot} · {apt.doctorName}
                  </span>
                </div>
                {canManageQueue && (
                  <button
                    disabled={busyAction}
                    onClick={() => handleCheckIn(apt.id)}
                    className="px-2.5 py-1 text-xs font-semibold rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    {language === 'ar' ? 'إصدار دور' : 'Check-In'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={language === 'ar' ? 'بحث برقم الدور، الاسم، أو الجوال...' : 'Search token #, name, phone...'}
            className="w-full pl-9 rtl:pl-3 rtl:pr-9 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-slate-500">{t.filterByDoctor}:</span>
          <select
            value={selectedDoctorId}
            onChange={e => setSelectedDoctorId(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
          >
            <option value="all">{language === 'ar' ? 'جميع الأطباء' : 'All Doctors'}</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Live Queue Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left rtl:text-right">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">{t.tokenNumber}</th>
                <th className="px-4 py-3">{t.patient}</th>
                <th className="px-4 py-3">{t.assignedDoctor}</th>
                <th className="px-4 py-3">{t.estimatedWait}</th>
                <th className="px-4 py-3">{t.queueStatus}</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredQueues.map(ticket => (
                <tr
                  key={ticket.id}
                  className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                    ticket.status === 'called' ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono font-extrabold text-sm text-teal-600 dark:text-teal-400">
                    {ticket.tokenNumber}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 dark:text-white block">{ticket.patientName}</span>
                    <span className="text-[11px] text-slate-400 font-mono">{ticket.patientPhone}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                    {ticket.doctorName}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                    {ticket.status === 'in_room' ? (
                      <span className="text-emerald-600 font-semibold">{language === 'ar' ? 'داخل العيادة' : 'In Room'}</span>
                    ) : ticket.status === 'called' ? (
                      <span className="text-amber-600 font-semibold">{language === 'ar' ? 'الآن' : 'Now!'}</span>
                    ) : (
                      `~${ticket.estimatedWaitMin} min`
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        ticket.status === 'in_room'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : ticket.status === 'called'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse'
                          : ticket.status === 'completed'
                          ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}
                    >
                      {ticket.status === 'in_room'
                        ? t.statusInRoom
                        : ticket.status === 'called'
                        ? t.statusCalled
                        : ticket.status === 'completed'
                        ? t.statusCompleted
                        : t.statusWaiting}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right rtl:text-left">
                    <div className="flex items-center justify-end rtl:justify-start gap-1.5">
                      {canManageQueue && ticket.status === 'waiting' && (
                        <button
                          disabled={busyAction}
                          onClick={() => handleUpdateQueueStatus(ticket.id, 'called')}
                          className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium cursor-pointer"
                        >
                          {t.btnCallNext}
                        </button>
                      )}

                      {canManageQueue && ticket.status === 'called' && (
                        <button
                          disabled={busyAction}
                          onClick={() => handleUpdateQueueStatus(ticket.id, 'in_room')}
                          className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium cursor-pointer"
                        >
                          {t.btnEnterRoom}
                        </button>
                      )}

                      {canManageQueue && ticket.status === 'in_room' && (
                        <button
                          disabled={busyAction}
                          onClick={() => handleUpdateQueueStatus(ticket.id, 'completed')}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium cursor-pointer"
                        >
                          {t.btnFinishVisit}
                        </button>
                      )}

                      <a
                        href={getWhatsAppUrl(ticket)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800"
                        title={t.btnSendWhatsApp}
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredQueues.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    {language === 'ar' ? 'لا توجد تذاكر انتظار مطابقة لخيارات البحث' : 'No queue tickets match the current filter'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
