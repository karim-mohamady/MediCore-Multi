import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Calendar, Clock, User, AlertCircle, CheckCircle } from 'lucide-react';

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({ isOpen, onClose }) => {
  const { language, currentClinic, users, patients, bookAppointment } = useApp();

  const doctors = users.filter(
    u => u.clinicId === currentClinic.id && (u.role === 'doctor' || u.role === 'clinic_owner')
  );

  const [doctorId, setDoctorId] = useState(doctors[0]?.id || '');
  const [patientId, setPatientId] = useState(patients[0]?.id || '');
  const [date, setDate] = useState('2026-11-12');
  const [timeSlot, setTimeSlot] = useState('11:30');
  const [type, setType] = useState<'consultation' | 'followup' | 'procedure'>('consultation');
  const [notes, setNotes] = useState('');
  const [fee, setFee] = useState(300);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const targetDoc = doctors.find(d => d.id === doctorId) || doctors[0];
    const targetPat = patients.find(p => p.id === patientId) || patients[0];

    if (!targetDoc || !targetPat) {
      setErrorMessage(
        language === 'ar'
          ? 'يرجى التأكد من توفر مريض وطبيب مسجلين قبل حجز الموعد.'
          : 'Please ensure a valid patient and doctor are available before booking.'
      );
      return;
    }

    const result = await bookAppointment({
      clinicId: currentClinic.id,
      branchId: currentClinic.branches[0]?.id || 'branch-1',
      doctorId: targetDoc.id,
      doctorName: targetDoc.name,
      patientId: targetPat.id,
      patientName: targetPat.name,
      patientPhone: targetPat.phone,
      date,
      timeSlot,
      durationMin: 30,
      type,
      status: 'scheduled',
      notes,
      fee: Number(fee),
    });

    if (!result.success) {
      setErrorMessage(result.message || 'Error booking appointment');
    } else {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'ar' ? 'حجز موعد طبي جديد (مع فحص التعارض)' : 'Book New Appointment (Conflict-Checked)'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{language === 'ar' ? 'تم تأكيد وحجز الموعد بنجاح!' : 'Appointment confirmed successfully!'}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'المريض' : 'Patient'}
              </label>
              <select
                value={patientId}
                onChange={e => setPatientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.fileNumber})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'الطبيب المعالج' : 'Doctor'}
              </label>
              <select
                value={doctorId}
                onChange={e => setDoctorId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.specialty ? `(${d.specialty})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'التاريخ' : 'Date'}
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'الفترة الزمنية' : 'Time Slot'}
              </label>
              <input
                type="time"
                value={timeSlot}
                onChange={e => setTimeSlot(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'نوع الزيارة' : 'Appointment Type'}
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="consultation">{language === 'ar' ? 'كشف أول مرة' : 'First Consultation'}</option>
                <option value="followup">{language === 'ar' ? 'مراجعة / استشارة' : 'Follow-up'}</option>
                <option value="procedure">{language === 'ar' ? 'إجراء طبي' : 'Procedure'}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'رسوم الكشف (ر.س)' : 'Fee (SAR)'}
              </label>
              <input
                type="number"
                value={fee}
                onChange={e => setFee(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
              {language === 'ar' ? 'ملاحظات الكشف / الشكوى المبدئية' : 'Notes / Initial Complaint'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={language === 'ar' ? 'مثال: فحص دوري أو شكوى من خفقان...' : 'e.g. routine checkup...'}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold cursor-pointer shadow-sm"
            >
              {language === 'ar' ? 'تأكيد الحجز' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
