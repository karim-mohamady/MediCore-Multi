import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Stethoscope,
  ShieldCheck,
  Clock,
  Activity,
  CalendarCheck2,
  Receipt,
  Users,
  Smartphone,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface LandingPageViewProps {
  onOpenOnboarding: () => void;
  onEnterDashboard: () => void;
  onOpenNewAppointment: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  onOpenOnboarding,
  onEnterDashboard,
  onOpenNewAppointment,
}) => {
  const { language, t } = useApp();

  return (
    <div className="space-y-16 py-6">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-4xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {language === 'ar'
              ? 'الجيل الجديد من منصات إدارة المنشآت الطبية الذكية'
              : 'Next-Generation Multi-Tenant Healthcare SaaS'}
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          {language === 'ar' ? (
            <>
              منظومة <span className="text-teal-600 dark:text-teal-400">MediCore</span> المتكاملة لإدارة العيادات والمراكز الطبية
            </>
          ) : (
            <>
              Enterprise Healthcare & Multi-Tenant Clinic Management with <span className="text-teal-600 dark:text-teal-400">MediCore</span>
            </>
          )}
        </h1>

        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
          {language === 'ar'
            ? 'مساحة عمل سحابية معزولة لكل عيادة، نظام صالة انتظار ذكي مع تذاكر دور فورية وإشعارات واتساب، سجل طبي إلكتروني متكامل، فوترة محاسبية، وبوابة مريض متطورة.'
            : 'Strict logical multi-tenant isolation, real-time waiting room queues with WhatsApp alerts, clinical EHR consultation room, immutable ledger billing, and patient portal.'}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={onOpenOnboarding}
            className="px-6 py-3 text-xs sm:text-sm font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-md flex items-center gap-2"
          >
            <span>{language === 'ar' ? 'سجّل عيادتك الآن مجاناً' : 'Onboard Your Clinic Free'}</span>
            {language === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </button>

          <button
            onClick={onEnterDashboard}
            className="px-6 py-3 text-xs sm:text-sm font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            {language === 'ar' ? 'الدخول للوحة العمليات التشغيلية' : 'Enter Live Workspace'}
          </button>

          <button
            onClick={onOpenNewAppointment}
            className="px-6 py-3 text-xs sm:text-sm font-semibold rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            {language === 'ar' ? 'حجز موعد كشف (للمرضى)' : 'Patient Guest Booking'}
          </button>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4 text-xs">
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {language === 'ar' ? 'صالة انتظار وطابور ذكي (Smart Queue)' : 'Smart Real-Time Queue & Tokens'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            {language === 'ar'
              ? 'توليد أرقام الدور التسلسلية (مثل A-012)، حساب أوقات الانتظار بدقة، وشاشة تلفزيونية تحمي خصوصية المرضى وروابط واتساب فورية.'
              : 'Sequential privacy-safe tokens, waiting time estimators, TV lobby monitor mode, and direct WhatsApp alerts.'}
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {language === 'ar' ? 'غرفة كشف الطبيب والسجل الطبي (EHR)' : 'Doctor Consultation Room & EHR'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            {language === 'ar'
              ? 'تسجيل العلامات الحيوية وحساب مؤشر كتلة الجسم (BMI) آلياً، تدوين التشخيص والروشتات الرقمية وطلبات التحاليل بضغطة زر.'
              : 'Vital signs entry with auto BMI, clinical diagnosis, medication prescription builder, and diagnostic orders.'}
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {language === 'ar' ? 'أمان معزول وسجل مالي غير قابل للتعديل' : 'Tenant Isolation & Financial Ledger'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            {language === 'ar'
              ? 'عزل بيانات المنشآت عبر قواعد أمان Firebase Firestore الصارمة، وقفل القيود المحاسبية والفواتير المسددة للامتثال المالي.'
              : 'Hardened Firestore Security Rules v2 enforcing logical multi-tenancy, PHI confidentiality, and immutable invoices.'}
          </p>
        </div>
      </section>
    </div>
  );
};
