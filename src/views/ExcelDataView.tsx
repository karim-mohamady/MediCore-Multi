import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface FailedImportRow {
  row: Record<string, string>;
  reason: string;
}

function parseCsvText(text: string): Array<Record<string, string>> {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = vals[i] ?? '';
    });
    return record;
  });
}

export const ExcelDataView: React.FC = () => {
  const { language, currentClinic, patients, appointments, addPatient } = useApp();

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [succeededNames, setSucceededNames] = useState<string[]>([]);
  const [failedDetails, setFailedDetails] = useState<FailedImportRow[]>([]);
  const [importing, setImporting] = useState<boolean>(false);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([]);

  const exportToCSV = (data: Record<string, unknown>[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvBody =
      '\uFEFF' +
      [
        headers.join(','),
        ...data.map((row) =>
          headers
            .map((h) => {
              const val = row[h];
              return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : String(val ?? '');
            })
            .join(',')
        ),
      ].join('\n');

    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPatients = () => {
    const clinicPatients = patients.filter((p) => p.clinicId === currentClinic.id);
    const formatted = clinicPatients.map((p) => ({
      FileNumber: p.fileNumber,
      FullName: p.name,
      Phone: p.phone,
      NationalId: p.nationalId,
      Gender: p.gender,
      DOB: p.dob,
      BloodGroup: p.bloodGroup,
      Allergies: p.allergies.join('; '),
      ChronicConditions: p.chronicDiseases.join('; '),
    }));
    exportToCSV(formatted, `MediCore_Patients_${currentClinic.code}_${new Date().toISOString().split('T')[0]}`);
  };

  const handleExportAppointments = () => {
    const clinicApts = appointments.filter((a) => a.clinicId === currentClinic.id);
    const formatted = clinicApts.map((a) => ({
      AppointmentId: a.id,
      PatientName: a.patientName,
      DoctorName: a.doctorName,
      Date: a.date,
      TimeSlot: a.timeSlot,
      Type: a.type,
      Status: a.status,
      Fee: a.fee,
      QueueToken: a.queueToken || '',
    }));
    exportToCSV(formatted, `MediCore_Schedule_${currentClinic.code}_${new Date().toISOString().split('T')[0]}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportStatus(null);
    setSucceededNames([]);
    setFailedDetails([]);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (parsed.length === 0) {
        setImportError(
          language === 'ar'
            ? 'الملف فارغ أو لا يحتوي على أعمدة صالحة (FullName, Phone, NationalId).'
            : 'CSV file is empty or missing valid data rows (FullName, Phone, NationalId).'
        );
        return;
      }
      setPreviewRows(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSimulateImport = () => {
    setImportError(null);
    setImportStatus(null);
    setSucceededNames([]);
    setFailedDetails([]);
    const sample = [
      { FullName: 'Nasser Al-Subaie', Phone: '+966 50 999 1234', NationalId: '1099887766', Blood: 'B+' },
      { FullName: 'Hessa Al-Mutairi', Phone: '+966 54 888 4321', NationalId: '1088776655', Blood: 'O+' },
      { FullName: 'Bader Al-Shammari', Phone: '+966 56 777 5678', NationalId: '1077665544', Blood: 'A+' },
    ];
    setPreviewRows(sample);
  };

  const handleConfirmImport = async () => {
    setImportError(null);
    setImportStatus(null);
    setSucceededNames([]);
    setFailedDetails([]);
    setImporting(true);

    const existingNationalIds = new Set(
      patients.filter((p) => p.clinicId === currentClinic.id).map((p) => p.nationalId.trim())
    );
    const seenBatchIds = new Set<string>();
    const committed: string[] = [];
    const failed: FailedImportRow[] = [];

    try {
      for (let idx = 0; idx < previewRows.length; idx++) {
        const r = previewRows[idx];
        const fullName = (r.FullName || r.name || '').trim();
        const phone = (r.Phone || r.phone || '').trim();
        const nationalId = (r.NationalId || r.nationalId || '').trim();
        const bloodGroup = (r.Blood || r.BloodGroup || 'O+').trim();

        if (!fullName || !phone || !nationalId) {
          failed.push({
            row: r,
            reason:
              language === 'ar'
                ? 'حقول إلزامية مفقودة (الاسم، الجوال، أو الهوية الوطنية)'
                : 'Missing required fields (FullName, Phone, or NationalId)',
          });
          continue;
        }

        if (existingNationalIds.has(nationalId) || seenBatchIds.has(nationalId)) {
          failed.push({
            row: r,
            reason:
              language === 'ar'
                ? `سجل مكرر للهوية الوطنية: ${nationalId}`
                : `Duplicate patient record for NationalId: ${nationalId}`,
          });
          continue;
        }

        try {
          await addPatient({
            clinicId: currentClinic.id,
            fileNumber: `MED-IMP-${Date.now().toString().slice(-4)}-${idx + 1}`,
            nationalId,
            name: fullName,
            nameAr: fullName,
            phone,
            gender: r.Gender === 'female' ? 'female' : 'male',
            dob: r.DOB || '1988-05-15',
            bloodGroup,
            allergies: [],
            chronicDiseases: [],
            emergencyContact: { name: 'Contact', relationship: 'Family', phone },
          });
          seenBatchIds.add(nationalId);
          existingNationalIds.add(nationalId);
          committed.push(fullName);
        } catch (err) {
          failed.push({
            row: r,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      setSucceededNames(committed);
      setFailedDetails(failed);

      if (failed.length > 0) {
        setImportError(
          language === 'ar'
            ? `استيراد غير مكتمل: نجح ${committed.length} وفشل ${failed.length} من أصل ${previewRows.length} سجل.`
            : `Partial or failed import: ${committed.length} succeeded, ${failed.length} failed out of ${previewRows.length} rows.`
        );
        setPreviewRows(failed.map((f) => f.row));
      } else {
        setImportStatus(
          language === 'ar'
            ? `تم استيراد ${committed.length} سجلات طبية بنجاح إلى قاعدة بيانات العيادة!`
            : `Successfully imported ${committed.length} patient records into clinic database!`
        );
        setPreviewRows([]);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {language === 'ar' ? 'تكامل بيانات إكسل و CSV (Excel Data Hub)' : 'Excel & CSV Data Hub'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'ar'
                ? 'استيراد وتصدير بيانات المرضى والمواعيد بترميز UTF-8 والتحقق من التكرار لكل صف'
                : 'UTF-8 CSV import & export with row validation, duplicate detection, and per-row error reporting'}
            </p>
          </div>
        </div>
      </div>

      {importError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{importError}</span>
          </div>
          {succeededNames.length > 0 && (
            <div className="text-emerald-700 dark:text-emerald-300">
              {language === 'ar' ? 'السجلات التي تم حفظها:' : 'Committed records:'} {succeededNames.join(', ')}
            </div>
          )}
          {failedDetails.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {failedDetails.map((f, i) => (
                <li key={i}>
                  <span className="font-mono">{f.row.FullName || f.row.NationalId || `Row ${i + 1}`}</span>: {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {importStatus && !importError && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{importStatus}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Download className="w-4 h-4 text-teal-600" />
            <span>{language === 'ar' ? 'تصدير بيانات المنشأة' : 'Export Clinic Data'}</span>
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            {language === 'ar'
              ? 'توليد ملفات CSV متوافقة مع Excel تدعم الترميز العربي UTF-8 بضغطة زر واحدة.'
              : 'Generate UTF-8 BOM spreadsheets compatible with Excel & Google Sheets.'}
          </p>

          <div className="space-y-2 pt-2">
            <button
              onClick={handleExportPatients}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <div className="text-left rtl:text-right">
                <span className="font-bold text-slate-900 dark:text-white block">
                  {language === 'ar' ? 'تصدير دليل المرضى والسجلات' : 'Export Patients Roster'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {patients.filter((p) => p.clinicId === currentClinic.id).length} {language === 'ar' ? 'سجلات' : 'records'}
                </span>
              </div>
              <Download className="w-4 h-4 text-teal-600" />
            </button>

            <button
              onClick={handleExportAppointments}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <div className="text-left rtl:text-right">
                <span className="font-bold text-slate-900 dark:text-white block">
                  {language === 'ar' ? 'تصدير جدول المواعيد والطابور' : 'Export Appointments & Queue'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {appointments.filter((a) => a.clinicId === currentClinic.id).length} {language === 'ar' ? 'حجوزات' : 'bookings'}
                </span>
              </div>
              <Download className="w-4 h-4 text-blue-600" />
            </button>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" />
            <span>{language === 'ar' ? 'استيراد ملف مرضى جديد' : 'Import Patients from CSV'}</span>
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            {language === 'ar'
              ? 'ارفع ملف CSV لمعاينة الأعمدة والتحقق من التكرار قبل الحفظ في قاعدة البيانات.'
              : 'Upload a UTF-8 CSV file to validate columns and detect duplicates before committing.'}
          </p>

          <div className="p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-center space-y-3">
            <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
            <label className="inline-block px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
              <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
              {language === 'ar' ? 'اختيار ملف CSV من الجهاز' : 'Select CSV File'}
            </label>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <button
                onClick={handleSimulateImport}
                className="font-bold text-blue-600 hover:underline cursor-pointer"
              >
                {language === 'ar' ? 'أو انقر لمعاينة بيانات تجريبية' : 'Or load sample CSV preview'}
              </button>
            </div>
            <span className="text-[10px] text-slate-400 block font-mono">
              Required headers: FullName, Phone, NationalId (optional: Blood)
            </span>
          </div>

          {previewRows.length > 0 && (
            <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-2">
              <span className="font-bold text-blue-900 dark:text-blue-200 block">
                {language === 'ar' ? 'معاينة الصفوف الجاهزة للاستيراد:' : 'Preview Matched Rows:'}
              </span>
              <div className="space-y-1 font-mono text-[11px]">
                {previewRows.map((r, i) => (
                  <div key={i} className="flex justify-between p-1 bg-white dark:bg-slate-800 rounded">
                    <span>{r.FullName || r.name || '—'}</span>
                    <span className="text-slate-400">{r.NationalId || r.nationalId || '—'}</span>
                  </div>
                ))}
              </div>
              <button
                disabled={importing}
                onClick={handleConfirmImport}
                className="w-full py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold cursor-pointer shadow-xs mt-2"
              >
                {importing
                  ? language === 'ar'
                    ? 'جاري الحفظ...'
                    : 'Committing...'
                  : language === 'ar'
                  ? 'تأكيد وحفظ السجلات'
                  : 'Confirm & Commit Records'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
