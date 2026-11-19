import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Building2, User, Clock, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const { language, onboardNewClinic } = useApp();
  const [step, setStep] = useState<number>(1);

  const [clinicData, setClinicData] = useState({
    name: 'Al-Nour Specialized Eye Clinic',
    nameAr: 'عيادات النور التخصصية لطب وجراحة العيون',
    code: 'NUR',
    specialty: 'Ophthalmology & Eye Surgery',
    specialtyAr: 'طب وجراحة العيون والليزر',
    phone: '+966 11 234 5678',
    email: 'contact@al-nour-eye.com',
    city: 'Riyadh',
    address: 'Tahlia Street, Riyadh',
    status: 'active' as const,
    plan: 'free_spark' as const,
    workingHours: {
      start: '09:00',
      end: '21:00',
      days: [0, 1, 2, 3, 4],
    },
    branches: [
      {
        id: 'branch-main',
        name: 'Main Tahlia Branch',
        nameAr: 'فرع التحلية الرئيسي',
        phone: '+966 11 234 5678',
        city: 'Riyadh',
        address: 'Tahlia Street',
        isMain: true,
      },
    ],
  });

  const [ownerData, setOwnerData] = useState({
    name: 'Dr. Faisal Al-Ghamdi',
    email: 'dr.faisal@al-nour-eye.com',
    phone: '+966 50 776 5432',
  });

  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleFinish = async () => {
    setErrorMsg('');
    try {
      await onboardNewClinic(clinicData, ownerData);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {language === 'ar' ? 'معالج تسجيل عيادة أو منشأة طبية جديدة' : 'New Clinic Onboarding Wizard'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'ar' ? `المرحلة ${step} من 4: إعداد مساحة العمل المنفصلة (Multi-Tenant)` : `Step ${step} of 4: Multi-Tenant Workspace Setup`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress */}
        <div className="grid grid-cols-4 border-b border-slate-200 dark:border-slate-800 text-xs">
          <div className={`p-3 text-center border-b-2 font-medium ${step >= 1 ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/30' : 'border-transparent text-slate-400'}`}>
            1. {language === 'ar' ? 'البيانات' : 'Facility'}
          </div>
          <div className={`p-3 text-center border-b-2 font-medium ${step >= 2 ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/30' : 'border-transparent text-slate-400'}`}>
            2. {language === 'ar' ? 'المالك' : 'Owner'}
          </div>
          <div className={`p-3 text-center border-b-2 font-medium ${step >= 3 ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/30' : 'border-transparent text-slate-400'}`}>
            3. {language === 'ar' ? 'أوقات العمل' : 'Hours'}
          </div>
          <div className={`p-3 text-center border-b-2 font-medium ${step >= 4 ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/30' : 'border-transparent text-slate-400'}`}>
            4. {language === 'ar' ? 'التأكيد' : 'Launch'}
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
              {errorMsg}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <Building2 className="w-4 h-4 text-teal-600" />
                <span>{language === 'ar' ? 'معلومات المنشأة والترخيص' : 'Clinic & Facility Details'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'اسم العيادة (بالعربية)' : 'Clinic Name (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={clinicData.nameAr}
                    onChange={e => setClinicData({ ...clinicData, nameAr: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'اسم العيادة (بالإنجليزية)' : 'Clinic Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={clinicData.name}
                    onChange={e => setClinicData({ ...clinicData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'رمز المنشأة (3 أحرف)' : 'Clinic Code (3 letters)'}
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={clinicData.code}
                    onChange={e => setClinicData({ ...clinicData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'التخصص الرئيسي' : 'Primary Specialty'}
                  </label>
                  <input
                    type="text"
                    value={clinicData.specialtyAr}
                    onChange={e => setClinicData({ ...clinicData, specialtyAr: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'رقم الهاتف المعتمد' : 'Official Phone'}
                  </label>
                  <input
                    type="text"
                    value={clinicData.phone}
                    onChange={e => setClinicData({ ...clinicData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'المدينة' : 'City'}
                  </label>
                  <input
                    type="text"
                    value={clinicData.city}
                    onChange={e => setClinicData({ ...clinicData, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <User className="w-4 h-4 text-teal-600" />
                <span>{language === 'ar' ? 'حساب المالك والمدير العام' : 'Clinic Owner & Administrator'}</span>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'الاسم الكامل للمالك / الطبيب المؤسس' : 'Owner / Founder Full Name'}
                  </label>
                  <input
                    type="text"
                    value={ownerData.name}
                    onChange={e => setOwnerData({ ...ownerData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'البريد الإلكتروني المهني' : 'Work Email (Login)'}
                  </label>
                  <input
                    type="email"
                    value={ownerData.email}
                    onChange={e => setOwnerData({ ...ownerData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'رقم الجوال' : 'Mobile Number'}
                  </label>
                  <input
                    type="tel"
                    value={ownerData.phone}
                    onChange={e => setOwnerData({ ...ownerData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <Clock className="w-4 h-4 text-teal-600" />
                <span>{language === 'ar' ? 'ساعات وأيام العمل' : 'Working Hours & Shifts'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'بداية الدوام' : 'Opening Time'}
                  </label>
                  <input
                    type="time"
                    value={clinicData.workingHours.start}
                    onChange={e =>
                      setClinicData({
                        ...clinicData,
                        workingHours: { ...clinicData.workingHours, start: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                    {language === 'ar' ? 'نهاية الدوام' : 'Closing Time'}
                  </label>
                  <input
                    type="time"
                    value={clinicData.workingHours.end}
                    onChange={e =>
                      setClinicData({
                        ...clinicData,
                        workingHours: { ...clinicData.workingHours, end: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-300">
                {language === 'ar'
                  ? 'أيام العمل الافتراضية: الأحد إلى الخميس (يمكن تخصيص الفترات الصباحية والمسائية لاحقاً من الإعدادات).'
                  : 'Default schedule: Sunday to Thursday (Morning and evening split shifts can be customized in settings).'}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-600 dark:text-teal-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {language === 'ar' ? 'مساحة العمل جاهزة للإطلاق الفوري' : 'Workspace Ready to Launch!'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {language === 'ar'
                  ? `سيتم إنشاء مساحة عمل معزولة برمز المنشأة (${clinicData.code}) مع ربط حساب ${ownerData.name} كمالك للعيادة بصلاحيات كاملة.`
                  : `An isolated workspace will be created with code (${clinicData.code}) and assigned to ${ownerData.name} with full owner permissions.`}
              </p>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              {language === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              <span>{language === 'ar' ? 'السابق' : 'Previous'}</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1 px-5 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <span>{language === 'ar' ? 'التالي' : 'Next'}</span>
              {language === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="px-6 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-sm"
            >
              {language === 'ar' ? 'إطلاق مساحة العمل الآن' : 'Launch Workspace'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
