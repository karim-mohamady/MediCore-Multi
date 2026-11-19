import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, UserPlus, AlertCircle, CheckCircle } from 'lucide-react';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewPatientModal: React.FC<NewPatientModalProps> = ({ isOpen, onClose }) => {
  const { language, currentClinic, patients, addPatient } = useApp();

  const [nationalId, setNationalId] = useState('');
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [phone, setPhone] = useState('+966 5');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [dob, setDob] = useState('1990-01-01');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [allergies, setAllergies] = useState('None');
  const [chronic, setChronic] = useState('None');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Duplicate check on national ID or phone within this clinic
    const exists = patients.find(
      p => p.clinicId === currentClinic.id && (p.nationalId === nationalId || p.phone === phone)
    );
    if (exists) {
      setError(
        language === 'ar'
          ? `تنبيه: يوجد مريض مسجل مسبقاً بنفس رقم الهوية أو الجوال (${exists.name}) برقم ملف (${exists.fileNumber})`
          : `Duplicate detected: Patient already enrolled (${exists.name}) with file #${exists.fileNumber}`
      );
      return;
    }

    const nextFileNum = `MED-${1000 + patients.filter(p => p.clinicId === currentClinic.id).length + 1}`;

    try {
      await addPatient({
        clinicId: currentClinic.id,
        fileNumber: nextFileNum,
        nationalId,
        name,
        nameAr: nameAr || name,
        phone,
        gender,
        dob,
        bloodGroup,
        allergies: allergies.split(',').map(s => s.trim()).filter(s => s && s !== 'None'),
        chronicDiseases: chronic.split(',').map(s => s.trim()).filter(s => s && s !== 'None'),
        emergencyContact: {
          name: emergencyName || 'Relative',
          relationship: 'Family',
          phone: emergencyPhone || phone,
        },
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'ar' ? 'تسجيل مريض جديد وفتح ملف طبي' : 'New Patient Intake & File Registration'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{language === 'ar' ? 'تم فتح الملف الطبي للمريض بنجاح!' : 'Patient file created successfully!'}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'رقم الهوية الوطنية / الإقامة' : 'National / Resident ID'}
              </label>
              <input
                type="text"
                required
                value={nationalId}
                onChange={e => setNationalId(e.target.value)}
                placeholder="10XXXXXXXX"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'رقم الجوال' : 'Phone'}
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'الاسم بالإنجليزية' : 'Full Name (English)'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'الاسم بالعربية' : 'Full Name (Arabic)'}
              </label>
              <input
                type="text"
                value={nameAr}
                onChange={e => setNameAr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'الجنس' : 'Gender'}
              </label>
              <select
                value={gender}
                onChange={e => setGender(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="male">{language === 'ar' ? 'ذكر' : 'Male'}</option>
                <option value="female">{language === 'ar' ? 'أنثى' : 'Female'}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'تاريخ الميلاد' : 'Date of Birth'}
              </label>
              <input
                type="date"
                value={dob}
                onChange={e => setDob(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'فصيلة الدم' : 'Blood Group'}
              </label>
              <select
                value={bloodGroup}
                onChange={e => setBloodGroup(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              >
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'الحساسية من أدوية' : 'Known Drug Allergies'}
              </label>
              <input
                type="text"
                value={allergies}
                onChange={e => setAllergies(e.target.value)}
                placeholder="Penicillin, Sulfa..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
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
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer shadow-sm"
            >
              {language === 'ar' ? 'حفظ وفتح الملف' : 'Save & Open File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
