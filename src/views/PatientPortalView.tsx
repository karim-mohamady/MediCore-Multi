import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Smartphone,
  Clock,
  Calendar,
  Pill,
  FlaskConical,
  Download,
  AlertCircle,
  CheckCircle2,
  PhoneCall,
  User,
} from 'lucide-react';

interface PatientPortalViewProps {
  onOpenNewAppointment: () => void;
}

export const PatientPortalView: React.FC<PatientPortalViewProps> = ({ onOpenNewAppointment }) => {
  const { language, currentClinic, currentUser, isDemoMode, queues, patients, appointments, prescriptions, labs } = useApp();
  const [activeTab, setActiveTab] = useState<'queue' | 'appointments' | 'prescriptions' | 'labs'>('queue');

  const patient = isDemoMode
    ? patients.find((p) => p.id === currentUser.patientId || p.id === currentUser.id) || patients[0]
    : patients.find((p) => p.id === currentUser.patientId || p.id === currentUser.id || p.userId === currentUser.id);
  if (!patient) {
    return (
      <div className="max-w-2xl mx-auto p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
        {language === 'ar'
          ? 'لم يتم العثور على ملف مريض مرتبط بهذا الحساب. يرجى تسجيل الدخول بحساب مريض معتمد.'
          : 'No patient profile linked to the active session. Sign in with a patient account or switch to Demo Mode.'}
      </div>
    );
  }

  const patientTicket = queues.find(q => q.patientId === patient.id && (q.status === 'waiting' || q.status === 'called' || q.status === 'in_room'));
  const patientApts = appointments.filter(a => a.patientId === patient.id);
  const patientRxs = prescriptions.filter(rx => rx.patientId === patient.id && rx.status !== 'draft');
  const patientLabs = labs.filter(l => l.patientId === patient.id && (isDemoMode ? true : l.status === 'approved'));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Mobile-style Top Card */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-blue-700 to-teal-700 text-white shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center font-bold text-lg">
              {patient.name.charAt(0)}
            </div>
            <div>
              <span className="text-xs text-teal-200 block">
                {language === 'ar' ? 'أهلاً بك، المراجع' : 'Welcome back,'}
              </span>
              <h2 className="text-lg font-bold">{patient.name}</h2>
              <span className="text-xs font-mono text-teal-100">
                {patient.fileNumber} · {currentClinic.name}
              </span>
            </div>
          </div>

          <button
            onClick={onOpenNewAppointment}
            className="px-3 py-1.5 rounded-xl bg-white text-blue-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer shadow-xs"
          >
            + {language === 'ar' ? 'حجز موعد' : 'Book Visit'}
          </button>
        </div>

        {/* Live Active Queue Tracker */}
        {patientTicket ? (
          <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-4 h-4 text-amber-300" />
                {language === 'ar' ? 'تذكرتك النشطة في صالة الانتظار' : 'Your Live Waiting Ticket'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 font-bold text-[10px]">
                {patientTicket.status === 'called'
                  ? (language === 'ar' ? 'تم النداء للعيادة!' : 'Called to Room!')
                  : patientTicket.status === 'in_room'
                  ? (language === 'ar' ? 'داخل العيادة حالياً' : 'Consulting Now')
                  : (language === 'ar' ? 'في الانتظار' : 'In Line')}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <span className="text-4xl font-extrabold font-mono text-amber-300">
                  {patientTicket.tokenNumber}
                </span>
                <span className="text-xs block text-teal-100 mt-0.5">
                  {patientTicket.doctorName}
                </span>
              </div>

              <div className="text-right rtl:text-left font-mono">
                <span className="text-2xl font-bold">
                  ~{patientTicket.estimatedWaitMin}
                </span>
                <span className="text-xs text-teal-200 block">
                  {language === 'ar' ? 'دقيقة متوقعة' : 'mins wait'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-white/10 text-xs text-center text-teal-100">
            {language === 'ar' ? 'لا يوجد تذكرة انتظار نشطة اليوم. يمكنك حجز موعد في أي وقت.' : 'No active queue ticket today.'}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
        <button
          onClick={() => setActiveTab('queue')}
          className={`py-2 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'queue' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs' : 'text-slate-500'
          }`}
        >
          {language === 'ar' ? 'الدور' : 'Queue'}
        </button>
        <button
          onClick={() => setActiveTab('appointments')}
          className={`py-2 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'appointments' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs' : 'text-slate-500'
          }`}
        >
          {language === 'ar' ? 'المواعيد' : 'Visits'}
        </button>
        <button
          onClick={() => setActiveTab('prescriptions')}
          className={`py-2 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'prescriptions' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs' : 'text-slate-500'
          }`}
        >
          {language === 'ar' ? 'الروشتات' : 'Rx'}
        </button>
        <button
          onClick={() => setActiveTab('labs')}
          className={`py-2 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'labs' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs' : 'text-slate-500'
          }`}
        >
          {language === 'ar' ? 'التحاليل' : 'Labs'}
        </button>
      </div>

      {/* Tab Panels */}
      <div className="space-y-4">
        {activeTab === 'queue' && (
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              {language === 'ar' ? 'إرشادات الحضور والانتظار' : 'Lobby & Reception Instructions'}
            </h3>
            <ul className="space-y-2 text-slate-600 dark:text-slate-300 list-disc list-inside">
              <li>
                {language === 'ar'
                  ? 'يرجى التواجد بالقرب من صالة الانتظار عند وصول وقت الانتظار إلى 5 دقائق.'
                  : 'Please be near the clinic waiting lobby when estimated time reaches 5 minutes.'}
              </li>
              <li>
                {language === 'ar'
                  ? 'سيتم نداء رقم التذكرة صوتياً على الشاشات المعلقة وإرسال إشعار فوري عبر واتساب.'
                  : 'Your ticket will be called aloud on ceiling screens and notified via WhatsApp.'}
              </li>
              <li>
                {language === 'ar'
                  ? 'في حال الرغبة بإعادة الجدولة، يرجى التوجه لموظف الاستقبال.'
                  : 'To reschedule or pause your turn, please speak with the receptionist.'}
              </li>
            </ul>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="space-y-3">
            {patientApts.map(apt => (
              <div
                key={apt.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block text-sm">
                    {apt.doctorName}
                  </span>
                  <span className="text-slate-500 font-mono">
                    {apt.date} · {apt.timeSlot}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  {apt.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'prescriptions' && (
          <div className="space-y-3">
            {patientRxs.map(rx => (
              <div
                key={rx.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3 text-xs"
              >
                <div className="flex justify-between items-start pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {rx.doctorName}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">{rx.date}</span>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {rx.medications.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1"
                    >
                      <span className="font-bold text-slate-900 dark:text-white block">
                        💊 {m.name}
                      </span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        {m.dosage} · {m.frequency} ({m.duration})
                      </p>
                      {m.instructions && (
                        <p className="text-[10px] text-teal-700 dark:text-teal-300 italic">
                          *{m.instructions}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'labs' && (
          <div className="space-y-3">
            {patientLabs.map(order => (
              <div
                key={order.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3 text-xs"
              >
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white uppercase font-mono">
                      {order.category}
                    </span>
                    <span className="text-[11px] text-slate-400 block">{order.completedAt ? `Completed: ${new Date(order.completedAt).toLocaleDateString()}` : 'In progress'}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                    {order.status}
                  </span>
                </div>

                <div className="space-y-2">
                  {order.tests.map((tItem, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          {language === 'ar' ? tItem.testNameAr : tItem.testName}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Ref: {tItem.referenceRange} {tItem.unit}
                        </span>
                      </div>
                      <div className="text-right rtl:text-left">
                        <span
                          className={`font-mono font-bold text-sm block ${
                            tItem.isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {tItem.resultValue} {tItem.unit}
                        </span>
                        {tItem.isAbnormal && (
                          <span className="text-[10px] text-red-500 font-bold">
                            ⚠️ {language === 'ar' ? 'قيمة غير طبيعية' : 'Abnormal'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
