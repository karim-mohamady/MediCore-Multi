import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { hasRolePermission } from '../lib/permissions';
import {
  Stethoscope,
  Activity,
  Pill,
  FlaskConical,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  FileCheck,
  Loader2,
} from 'lucide-react';
import { Medication } from '../types';
import { buildLabOrderSignature } from '../lib/firestore';

export const DoctorWorkspaceView: React.FC = () => {
  const {
    t,
    language,
    currentClinic,
    currentUser,
    currentRole,
    queues,
    patients,
    vitals,
    labs,
    recordVitals,
    savePrescription,
    createLabOrder,
  } = useApp();

  const canModifyClinicalRecords = hasRolePermission(currentRole, 'canModifyClinicalRecords');
  const canAccessPHI = hasRolePermission(currentRole, 'canAccessPHI');

  // Find active or called queue tickets
  const clinicQueues = queues.filter(q => q.clinicId === currentClinic.id);
  const activeTicket =
    clinicQueues.find(q => q.status === 'in_room') ||
    clinicQueues.find(q => q.status === 'called') ||
    clinicQueues[0];

  const currentPatient = patients.find(p => p.id === activeTicket?.patientId) || patients[0];
  const patientVitals = (currentPatient && vitals[currentPatient.id]) || {
    bpSystolic: 120,
    bpDiastolic: 80,
    heartRate: 70,
    temperature: 37.0,
    weightKg: 75,
    heightCm: 175,
    bmi: 24.5,
    recordedAt: '',
    recordedBy: '',
  };

  // Vitals State
  const [systolic, setSystolic] = useState(patientVitals.bpSystolic);
  const [diastolic, setDiastolic] = useState(patientVitals.bpDiastolic);
  const [hr, setHr] = useState(patientVitals.heartRate);
  const [temp, setTemp] = useState(patientVitals.temperature);
  const [weight, setWeight] = useState(patientVitals.weightKg);
  const [height, setHeight] = useState(patientVitals.heightCm);

  // Auto calculate BMI
  const heightM = height / 100;
  const bmi = heightM > 0 ? Math.round((weight / (heightM * heightM)) * 10) / 10 : 0;
  const bmiCategory =
    bmi < 18.5
      ? (language === 'ar' ? 'نقص وزن' : 'Underweight')
      : bmi < 25
      ? (language === 'ar' ? 'وزن طبيعي' : 'Normal')
      : bmi < 30
      ? (language === 'ar' ? 'زيادة وزن' : 'Overweight')
      : (language === 'ar' ? 'سمنة' : 'Obese');

  // Clinical notes
  const [clinicalComplaint, setClinicalComplaint] = useState(
    'Patient presents for routine follow-up with complaints of mild morning fatigue.'
  );
  const [diagnosis, setDiagnosis] = useState('Essential Primary Hypertension (I10)');

  // Prescriptions state
  const [medications, setMedications] = useState<Medication[]>([
    {
      name: 'Amlodipine (Norvasc) 5mg',
      dosage: '1 tablet',
      frequency: 'Once daily in the morning',
      duration: '30 days',
      instructions: 'Take with full glass of water',
    },
  ]);

  // Lab test orders
  const [selectedLabs, setSelectedLabs] = useState<string[]>(['Lipid Panel (Full)', 'Fasting Blood Glucose']);
  const [orderingLabs, setOrderingLabs] = useState(false);
  const [labSuccess, setLabSuccess] = useState<string | null>(null);
  const [labError, setLabError] = useState<string | null>(null);
  const labSubmitRef = useRef(false);

  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [vitalsSaved, setVitalsSaved] = useState(false);
  const [clinicalError, setClinicalError] = useState<string | null>(null);
  const finalizeRef = useRef(false);

  useEffect(() => {
    setFinalized(false);
    setVitalsSaved(false);
    setClinicalError(null);
    setLabSuccess(null);
    setLabError(null);
  }, [currentPatient?.id]);

  if (!currentPatient) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
        {language === 'ar'
          ? 'لا يوجد مرضى مسجلون أو في غرفة الفحص حالياً.'
          : 'No patient records available in this clinic workspace yet.'}
      </div>
    );
  }

  const handleAddMed = () => {
    setMedications([
      ...medications,
      {
        name: 'Metformin 500mg',
        dosage: '1 tablet',
        frequency: 'Twice daily with meals',
        duration: '30 days',
        instructions: 'After lunch and dinner',
      },
    ]);
  };

  const handleRemoveMed = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const patientLabOrders = labs.filter(
    (l) => l.clinicId === currentClinic.id && l.patientId === currentPatient.id
  );
  const orderingDoctorId =
    currentUser.role === 'doctor' ? currentUser.id : activeTicket?.doctorId || currentUser.id || 'doc-1';
  const orderingDoctorName =
    currentUser.role === 'doctor' ? currentUser.name : activeTicket?.doctorName || currentUser.name || 'Consultant Physician';

  const hasActiveOrderWithSameTests = (testNames: string[]) => {
    if (testNames.length === 0) return false;
    const sig = buildLabOrderSignature(currentPatient.id, testNames);
    const activeStatuses = new Set(['pending', 'ordered', 'sample_taken']);
    return patientLabOrders.some(
      (order) =>
        activeStatuses.has(order.status) &&
        buildLabOrderSignature(order.patientId, order.tests.map((item) => item.testName)) === sig
    );
  };

  const handleOrderLabs = async () => {
    if (labSubmitRef.current || orderingLabs) return;
    setLabError(null);
    setLabSuccess(null);
    if (selectedLabs.length === 0) {
      setLabError(
        language === 'ar'
          ? 'يرجى تحديد تحليل مخبري واحد على الأقل قبل إرسال الطلب.'
          : 'Please select at least one laboratory test before ordering.'
      );
      return;
    }

    labSubmitRef.current = true;
    setOrderingLabs(true);
    try {
      const created = await createLabOrder({
        patientId: currentPatient.id,
        patientName: currentPatient.name,
        doctorId: orderingDoctorId,
        doctorName: orderingDoctorName,
        testNames: selectedLabs,
        appointmentId: activeTicket?.appointmentId,
      });
      setLabSuccess(
        language === 'ar'
          ? `تم حفظ وإرسال طلب التحاليل (${created.tests.length}) للمريض ${currentPatient.name}.`
          : `Laboratory order (${created.tests.length} test(s)) persisted for ${currentPatient.name}.`
      );
    } catch (err) {
      setLabError(err instanceof Error ? err.message : String(err));
    } finally {
      labSubmitRef.current = false;
      setOrderingLabs(false);
    }
  };

  const handleSaveVitalsOnly = async () => {
    if (!canAccessPHI || finalizing) return;
    setFinalizing(true);
    setClinicalError(null);
    setVitalsSaved(false);
    try {
      await recordVitals(currentPatient.id, {
        bpSystolic: systolic,
        bpDiastolic: diastolic,
        heartRate: hr,
        temperature: temp,
        weightKg: weight,
        heightCm: height,
        bmi,
      });
      setVitalsSaved(true);
    } catch (err) {
      setClinicalError(err instanceof Error ? err.message : String(err));
    } finally {
      setFinalizing(false);
    }
  };

  const handleFinalize = async () => {
    if (!canModifyClinicalRecords) {
      setClinicalError(
        language === 'ar'
          ? 'اعتماد الزيارة وتوقيع الروشتة متاح للأطباء فقط.'
          : 'Only an authenticated Doctor can sign consultations and finalize digital prescriptions.'
      );
      return;
    }
    if (finalizeRef.current || finalizing || finalized) return;
    finalizeRef.current = true;
    setFinalizing(true);
    setClinicalError(null);
    try {
      await recordVitals(currentPatient.id, {
        bpSystolic: systolic,
        bpDiastolic: diastolic,
        heartRate: hr,
        temperature: temp,
        weightKg: weight,
        heightCm: height,
        bmi,
      });

      await savePrescription(
        {
          appointmentId: activeTicket?.appointmentId || 'apt-1',
          patientId: currentPatient.id,
          patientName: currentPatient.name,
          doctorId: orderingDoctorId,
          doctorName: orderingDoctorName,
          date: new Date().toISOString().split('T')[0],
          diagnosis,
          medications,
          notes: clinicalComplaint,
        },
        { queueTicketId: activeTicket?.id }
      );

      if (selectedLabs.length > 0 && !hasActiveOrderWithSameTests(selectedLabs)) {
        const createdLab = await createLabOrder({
          patientId: currentPatient.id,
          patientName: currentPatient.name,
          doctorId: orderingDoctorId,
          doctorName: orderingDoctorName,
          testNames: selectedLabs,
          appointmentId: activeTicket?.appointmentId,
        });
        setLabSuccess(
          language === 'ar'
            ? `تم حفظ طلب التحاليل (${createdLab.tests.length}) مع الزيارة.`
            : `Laboratory order (${createdLab.tests.length} test(s)) saved with consultation.`
        );
      }

      setFinalized(true);
    } catch (err) {
      setClinicalError(err instanceof Error ? err.message : String(err));
    } finally {
      finalizeRef.current = false;
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t.doctorTitle}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeTicket
                ? (language === 'ar'
                    ? `المريض قيد الفحص: ${currentPatient.name} (تذكرة ${activeTicket.tokenNumber})`
                    : `Active Consultation: ${currentPatient.name} (Token ${activeTicket.tokenNumber})`)
                : (language === 'ar' ? 'اختر مريضاً لبدء جلسة الكشف' : 'Select a patient to begin consultation')}
            </p>
          </div>
        </div>

        {canModifyClinicalRecords ? (
          <button
            onClick={handleFinalize}
            disabled={finalized || finalizing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer shadow-sm"
          >
            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
            <span>
              {finalizing
                ? (language === 'ar' ? 'جاري الاعتماد والحفظ...' : 'Saving & Finalizing...')
                : finalized
                ? (language === 'ar' ? 'تم اعتماد الزيارة وتوقيعها' : 'Visit Signed & Saved')
                : t.btnSaveAndFinalize}
            </span>
          </button>
        ) : (
          <button
            onClick={handleSaveVitalsOnly}
            disabled={!canAccessPHI || finalizing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer shadow-sm"
          >
            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            <span>
              {language === 'ar' ? 'حفظ القياسات الحيوية' : 'Save Vital Signs'}
            </span>
          </button>
        )}
      </div>

      {clinicalError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 flex items-center gap-3 text-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{clinicalError}</span>
        </div>
      )}

      {vitalsSaved && !finalized && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>
            {language === 'ar'
              ? 'تم حفظ القياسات الحيوية للمريض بنجاح. اعتماد الروشتة الطبية مقتصر على الطبيب المعالج.'
              : 'Vital signs saved successfully. Consultation signing & Rx issuance remain restricted to Physicians.'}
          </span>
        </div>
      )}

      {finalized && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>
            {language === 'ar'
              ? 'تم اعتماد التقرير الطبي، حفظ القياسات الحيوية، وإصدار الروشتة الإلكترونية بنجاح للمريض.'
              : 'Consultation finalized, vital signs updated, and digital Rx prescription saved successfully.'}
          </span>
        </div>
      )}

      {/* Patient Demographic Summary Strip */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center">
            {currentPatient.name.charAt(0)}
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white block text-sm">
              {currentPatient.name}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {currentPatient.fileNumber} · {currentPatient.gender} · {currentPatient.bloodGroup}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <div>
            <span className="text-slate-400 block">{t.allergies}:</span>
            <span className="font-semibold text-red-600 dark:text-red-400">
              {currentPatient.allergies.length > 0 ? currentPatient.allergies.join(', ') : 'None'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">{t.chronicConditions}:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {currentPatient.chronicDiseases.length > 0 ? currentPatient.chronicDiseases.join(', ') : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Split: Vitals & Notes vs Prescriptions & Labs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Vitals & Assessment */}
        <div className="space-y-6">
          {/* Vitals Box */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600" />
                {t.vitalsSection}
              </span>
              <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400 font-bold">
                BMI: {bmi} ({bmiCategory})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block mb-1 text-slate-500 dark:text-slate-400 font-medium">{t.systolic}</label>
                <input
                  type="number"
                  value={systolic}
                  onChange={e => setSystolic(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-500 dark:text-slate-400 font-medium">{t.diastolic}</label>
                <input
                  type="number"
                  value={diastolic}
                  onChange={e => setDiastolic(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-500 dark:text-slate-400 font-medium">{t.heartRate}</label>
                <input
                  type="number"
                  value={hr}
                  onChange={e => setHr(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-500 dark:text-slate-400 font-medium">{t.temperature}</label>
                <input
                  type="number"
                  step="0.1"
                  value={temp}
                  onChange={e => setTemp(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-500 dark:text-slate-400 font-medium">{t.height}</label>
                <input
                  type="number"
                  value={height}
                  onChange={e => setHeight(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-500 dark:text-slate-400 font-medium">{t.weight}</label>
                <input
                  type="number"
                  value={weight}
                  onChange={e => setWeight(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Clinical Assessment */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 text-xs">
            <div>
              <label className="block mb-1 font-bold text-slate-800 dark:text-slate-200">{t.clinicalNotes}</label>
              <textarea
                rows={3}
                value={clinicalComplaint}
                onChange={e => setClinicalComplaint(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block mb-1 font-bold text-slate-800 dark:text-slate-200">{t.diagnosis}</label>
              <input
                type="text"
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Prescription Builder & Lab Orders */}
        <div className="space-y-6">
          {/* Rx Builder */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pill className="w-4 h-4 text-blue-600" />
                {t.prescriptionBuilder}
              </span>
              <button
                type="button"
                onClick={handleAddMed}
                className="flex items-center gap-1 text-teal-600 dark:text-teal-400 font-semibold hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.addMedication}</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {medications.map((med, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={med.name}
                      onChange={e => {
                        const copy = [...medications];
                        copy[idx].name = e.target.value;
                        setMedications(copy);
                      }}
                      className="flex-1 font-bold text-slate-900 dark:text-white px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                    />
                    {medications.length > 1 && (
                      <button
                        onClick={() => handleRemoveMed(idx)}
                        className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                    <input
                      type="text"
                      value={med.dosage}
                      placeholder={t.medDosage}
                      onChange={e => {
                        const copy = [...medications];
                        copy[idx].dosage = e.target.value;
                        setMedications(copy);
                      }}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                    />
                    <input
                      type="text"
                      value={med.frequency}
                      placeholder={t.medFrequency}
                      onChange={e => {
                        const copy = [...medications];
                        copy[idx].frequency = e.target.value;
                        setMedications(copy);
                      }}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                    />
                    <input
                      type="text"
                      value={med.duration}
                      placeholder={t.medDuration}
                      onChange={e => {
                        const copy = [...medications];
                        copy[idx].duration = e.target.value;
                        setMedications(copy);
                      }}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lab Orders */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-indigo-600" />
                {t.labOrdersSection}
                {patientLabOrders.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                    {patientLabOrders.length}
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={handleOrderLabs}
                disabled={orderingLabs || selectedLabs.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-[11px] transition-colors cursor-pointer"
              >
                {orderingLabs ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="w-3.5 h-3.5" />
                )}
                <span>
                  {orderingLabs
                    ? (language === 'ar' ? 'جاري إرسال الطلب...' : 'Ordering...')
                    : (language === 'ar' ? 'إرسال طلب التحاليل' : 'Submit Lab Order')}
                </span>
              </button>
            </div>

            {labError && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center gap-2 text-[11px]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{labError}</span>
              </div>
            )}

            {labSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 flex items-center gap-2 text-[11px]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{labSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {[
                'Complete Blood Count (CBC)',
                'Fasting Blood Glucose',
                'HbA1c Glycated Hemoglobin',
                'Lipid Panel (Full)',
                'Liver Function Tests (LFT)',
                'Serum Creatinine & Urea',
              ].map(test => {
                const isChecked = selectedLabs.includes(test);
                return (
                  <label
                    key={test}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setLabError(null);
                        setLabSuccess(null);
                        if (isChecked) {
                          setSelectedLabs(selectedLabs.filter(l => l !== test));
                        } else {
                          setSelectedLabs([...selectedLabs, test]);
                        }
                      }}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-[11px] font-medium">{test}</span>
                  </label>
                );
              })}
            </div>

            {patientLabOrders.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                  {language === 'ar' ? 'طلبات التحاليل المحفوظة للمريض:' : 'Persisted Lab Orders for Patient:'}
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {patientLabOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                          {order.tests.map((item) => (language === 'ar' ? item.testNameAr : item.testName)).join(' · ')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(order.orderedAt).toLocaleDateString()} · {order.category}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                          order.status === 'completed' || order.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
