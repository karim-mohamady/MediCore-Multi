import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, Volume2, Clock, Users, Stethoscope } from 'lucide-react';

interface TVQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TVQueueModal: React.FC<TVQueueModalProps> = ({ isOpen, onClose }) => {
  const { queues, currentClinic, language, playChimeSound } = useApp();

  const clinicQueues = queues.filter(q => q.clinicId === currentClinic.id);
  const currentCalled = clinicQueues.filter(q => q.status === 'called' || q.status === 'in_room');
  const upcomingWaiting = clinicQueues.filter(q => q.status === 'waiting');

  useEffect(() => {
    if (isOpen) {
      playChimeSound();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col p-6 sm:p-10 select-none overflow-hidden">
      {/* Top Banner */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
            <Stethoscope className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {language === 'ar' ? currentClinic.nameAr : currentClinic.name}
            </h1>
            <p className="text-sm text-teal-400 font-medium">
              {language === 'ar' ? 'شاشة صالة الانتظار الذكية' : 'Smart Waiting Hall Display System'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={playChimeSound}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
            title="Test Chime Sound"
          >
            <Volume2 className="w-4 h-4 text-teal-400" />
            <span>{language === 'ar' ? 'صوت التنبيه' : 'Chime'}</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Exit Fullscreen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Grid: Active Calling Tickets vs Waiting Stream */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 py-8 items-stretch">
        {/* Left 2 Cols: Current Called Patient to Room */}
        <div className="lg:col-span-2 flex flex-col justify-center bg-slate-900/80 rounded-2xl p-8 border border-slate-800 relative overflow-hidden shadow-2xl">
          <div className="text-xs uppercase tracking-wider text-teal-400 font-bold mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            {language === 'ar' ? 'الدور المستدعى حالياً للعيادة' : 'Currently Called to Clinic'}
          </div>

          {currentCalled.length > 0 ? (
            <div className="space-y-6">
              {currentCalled.map((ticket, idx) => (
                <div key={ticket.id} className="p-6 rounded-xl bg-slate-800/70 border border-slate-700 flex flex-wrap items-center justify-between gap-6">
                  <div>
                    <span className="text-xs text-slate-400 block mb-1">
                      {language === 'ar' ? 'رقم التذكرة' : 'Ticket Number'}
                    </span>
                    <div className="text-6xl sm:text-7xl font-mono font-extrabold text-teal-400 tracking-wider">
                      {ticket.tokenNumber}
                    </div>
                  </div>

                  <div className="text-right rtl:text-left">
                    <span className="text-xs text-slate-400 block mb-1">
                      {language === 'ar' ? 'العيادة / الطبيب' : 'Room & Physician'}
                    </span>
                    <div className="text-2xl sm:text-3xl font-bold text-white mb-1">
                      {ticket.doctorName}
                    </div>
                    <div className="text-sm font-medium text-amber-400">
                      {ticket.status === 'called'
                        ? (language === 'ar' ? 'يرجى التوجه إلى غرفة الطبيب فوراً' : 'Please proceed to physician room')
                        : (language === 'ar' ? 'قيد الكشف والمعاينة' : 'Consultation in Progress')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Clock className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-lg font-medium">
                {language === 'ar' ? 'لا يوجد نداء نشط حالياً، يرجى الاستراحة في الصالة' : 'No active call currently, please wait comfortably'}
              </p>
            </div>
          )}
        </div>

        {/* Right Col: Upcoming Tickets In Line */}
        <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800 flex flex-col">
          <div className="text-sm font-bold text-slate-200 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-400" />
              {language === 'ar' ? 'التذاكر التالية بالانتظار' : 'Upcoming Queue'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-teal-400 font-mono font-bold">
              {upcomingWaiting.length}
            </span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
            {upcomingWaiting.map((ticket, index) => (
              <div
                key={ticket.id}
                className="flex items-center justify-between p-3.5 rounded-lg bg-slate-800/50 border border-slate-700/60"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono w-5">#{index + 1}</span>
                  <span className="text-xl font-bold font-mono text-teal-300">{ticket.tokenNumber}</span>
                </div>
                <div className="text-right rtl:text-left">
                  <span className="text-xs text-slate-300 block font-medium truncate max-w-[120px]">
                    {ticket.doctorName}
                  </span>
                  <span className="text-[11px] text-amber-400 font-mono">
                    ~{ticket.estimatedWaitMin} {language === 'ar' ? 'دقيقة' : 'min'}
                  </span>
                </div>
              </div>
            ))}

            {upcomingWaiting.length === 0 && (
              <div className="text-center py-10 text-slate-600 text-sm">
                {language === 'ar' ? 'صالة الانتظار خالية تماماً' : 'Waiting hall is currently empty'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer ticker */}
      <div className="border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between text-xs text-slate-400">
        <div>
          {language === 'ar'
            ? 'نظام تتبع الخصوصية الطبية: تُعرض أرقام الدور فقط دون أسماء المرضى لحماية الخصوصية.'
            : 'Privacy-Safe Queue: Only ticket numbers are displayed to protect patient confidentiality.'}
        </div>
        <div className="font-mono text-teal-400">
          MediCore v2.4 · {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
