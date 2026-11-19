import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { hasRolePermission } from '../lib/permissions';
import {
  Users,
  Search,
  UserPlus,
  FileText,
  Activity,
  Pill,
  Receipt,
  Phone,
  Shield,
  X,
} from 'lucide-react';
import { Patient } from '../types';

interface PatientsViewProps {
  onOpenNewPatient: () => void;
  onOpenNewAppointment: () => void;
}

export const PatientsView: React.FC<PatientsViewProps> = ({ onOpenNewPatient, onOpenNewAppointment }) => {
  const { t, language, currentClinic, currentRole, patients, vitals, prescriptions, invoices } = useApp();
  const canEnrollPatients = hasRolePermission(currentRole, 'canEnrollPatients');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [activeTab, setActiveTab] = useState<'vitals' | 'prescriptions' | 'invoices'>('vitals');

  const clinicPatients = patients.filter(p => {
    if (p.clinicId !== currentClinic.id) return false;
    const query = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      p.fileNumber.toLowerCase().includes(query) ||
      p.nationalId.includes(query) ||
      p.phone.includes(query)
    );
  });

  const patientVitals = selectedPatient ? vitals[selectedPatient.id] : null;
  const patientRxs = selectedPatient
    ? prescriptions.filter(rx => rx.patientId === selectedPatient.id)
    : [];
  const patientInvoices = selectedPatient
    ? invoices.filter(inv => inv.patientId === selectedPatient.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t.patientsDirectory}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {clinicPatients.length} {language === 'ar' ? 'ملفات طبية مسجلة' : 'registered patient health records'}
            </p>
          </div>
        </div>

        {canEnrollPatients && (
          <button
            onClick={onOpenNewPatient}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t.btnNewPatient}</span>
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-2.5 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full pl-9 rtl:pl-3 rtl:pr-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
        />
      </div>

      {/* Patient Directory Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left rtl:text-right">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">{t.fileNumber}</th>
                <th className="px-4 py-3">{t.patient}</th>
                <th className="px-4 py-3">{t.nationalId}</th>
                <th className="px-4 py-3">{t.phone}</th>
                <th className="px-4 py-3">{t.gender}</th>
                <th className="px-4 py-3">{t.bloodGroup}</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {clinicPatients.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPatient(p)}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-bold text-teal-600 dark:text-teal-400">
                    {p.fileNumber}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {p.name}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      DOB: {p.dob}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                    {p.nationalId}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                    {p.phone}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">
                    {p.gender}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-200">
                    {p.bloodGroup}
                  </td>
                  <td className="px-4 py-3 text-right rtl:text-left">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedPatient(p);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors"
                    >
                      {language === 'ar' ? 'عرض السجل (EHR)' : 'View EHR'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patient EHR Modal Drawer */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-sm">
                  {selectedPatient.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedPatient.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {selectedPatient.fileNumber} · {selectedPatient.nationalId} · {selectedPatient.phone}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedPatient(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* EHR Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 px-5 gap-4 text-xs font-medium">
              <button
                onClick={() => setActiveTab('vitals')}
                className={`py-3 border-b-2 cursor-pointer transition-colors ${
                  activeTab === 'vitals'
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400 font-semibold'
                    : 'border-transparent text-slate-500'
                }`}
              >
                <Activity className="w-3.5 h-3.5 inline mr-1" />
                {t.vitalsSection}
              </button>
              <button
                onClick={() => setActiveTab('prescriptions')}
                className={`py-3 border-b-2 cursor-pointer transition-colors ${
                  activeTab === 'prescriptions'
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400 font-semibold'
                    : 'border-transparent text-slate-500'
                }`}
              >
                <Pill className="w-3.5 h-3.5 inline mr-1" />
                {t.prescriptions} ({patientRxs.length})
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                className={`py-3 border-b-2 cursor-pointer transition-colors ${
                  activeTab === 'invoices'
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400 font-semibold'
                    : 'border-transparent text-slate-500'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 inline mr-1" />
                {t.invoices} ({patientInvoices.length})
              </button>
            </div>

            {/* Tab Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {activeTab === 'vitals' && (
                <div className="space-y-4">
                  {patientVitals ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] text-slate-400 block">{t.systolic}/{t.diastolic}</span>
                        <span className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                          {patientVitals.bpSystolic}/{patientVitals.bpDiastolic} mmHg
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] text-slate-400 block">{t.heartRate}</span>
                        <span className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                          {patientVitals.heartRate} bpm
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] text-slate-400 block">{t.temperature}</span>
                        <span className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                          {patientVitals.temperature} °C
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] text-slate-400 block">{t.weight} / {t.height}</span>
                        <span className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                          {patientVitals.weightKg}kg / {patientVitals.heightCm}cm
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 col-span-2">
                        <span className="text-[11px] text-slate-400 block">{t.bmi}</span>
                        <span className="text-lg font-mono font-bold text-teal-600 dark:text-teal-400">
                          {patientVitals.bmi}
                        </span>
                        <span className="text-[11px] text-slate-500 ml-2">
                          (Recorded by {patientVitals.recordedBy || 'Clinic Nurse'})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400">
                      {language === 'ar' ? 'لم يتم تسجيل قياسات حيوية لهذا المريض بعد' : 'No vitals logged yet'}
                    </div>
                  )}

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {language === 'ar' ? 'معلومات الطوارئ والحساسية' : 'Emergency & Allergies'}
                    </span>
                    <p className="text-slate-600 dark:text-slate-300">
                      {t.allergies}: <span className="font-semibold text-red-500">{selectedPatient.allergies.join(', ') || 'None'}</span>
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      {t.chronicConditions}: <span className="font-semibold">{selectedPatient.chronicDiseases.join(', ') || 'None'}</span>
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'prescriptions' && (
                <div className="space-y-3">
                  {patientRxs.map(rx => (
                    <div
                      key={rx.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2"
                    >
                      <div className="flex justify-between font-medium">
                        <span className="font-bold text-slate-900 dark:text-white">{rx.doctorName}</span>
                        <span className="font-mono text-slate-400">{rx.date}</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 italic">"{rx.diagnosis}"</p>
                      <div className="space-y-1.5 pt-1">
                        {rx.medications.map((m, i) => (
                          <div key={i} className="p-2 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-mono">
                            <span className="font-bold block text-slate-900 dark:text-white">{m.name}</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {m.dosage} · {m.frequency} · {m.duration}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {patientRxs.length === 0 && (
                    <div className="text-center py-6 text-slate-400">
                      {language === 'ar' ? 'لا توجد روشتات علاجية مسجلة' : 'No prescriptions recorded'}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'invoices' && (
                <div className="space-y-3">
                  {patientInvoices.map(inv => (
                    <div
                      key={inv.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-mono font-bold text-teal-600 block">{inv.invoiceNumber}</span>
                        <span className="text-[11px] text-slate-400">{inv.date}</span>
                      </div>
                      <div className="text-right rtl:text-left">
                        <span className="font-mono font-bold text-slate-900 dark:text-white block">
                          {inv.totalAmount} SAR
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            inv.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </div>
                    </div>
                  ))}

                  {patientInvoices.length === 0 && (
                    <div className="text-center py-6 text-slate-400">
                      {language === 'ar' ? 'لا توجد فواتير سابقة' : 'No invoices on file'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
