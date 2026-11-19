import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { hasRolePermission } from '../lib/permissions';
import {
  Receipt,
  CreditCard,
  PlusCircle,
  FileCheck,
  Printer,
  ShieldCheck,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { Invoice } from '../types';

interface BillingLedgerViewProps {
  onOpenNewInvoice: () => void;
}

export const BillingLedgerView: React.FC<BillingLedgerViewProps> = ({ onOpenNewInvoice }) => {
  const { t, language, currentClinic, currentRole, invoices, ledger, recordPayment } = useApp();
  const canIssueInvoices = hasRolePermission(currentRole, 'canIssueInvoices');
  const canCollectPayments = hasRolePermission(currentRole, 'canCollectPayments');

  const [activeTab, setActiveTab] = useState<'invoices' | 'ledger'>('invoices');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const clinicInvoices = invoices.filter(i => i.clinicId === currentClinic.id);
  const clinicLedger = ledger.filter(l => l.clinicId === currentClinic.id);

  const totalBilled = clinicInvoices.reduce((acc, i) => acc + i.totalAmount, 0);
  const totalCollected = clinicInvoices.reduce((acc, i) => acc + i.paidAmount, 0);
  const totalPending = totalBilled - totalCollected;

  const handlePayBalance = async (inv: Invoice) => {
    setPaymentError(null);
    try {
      const remaining = Math.round((inv.totalAmount - inv.paidAmount) * 100) / 100;
      await recordPayment(inv.id, remaining, 'card');
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      {paymentError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
          {paymentError}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t.invoicesTitle}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'ar'
                ? 'إدارة فواتير الخدمات الطبية وسندات التحصيل والقيود المالية المعزولة'
                : 'Medical billing, payment collection, and immutable tenant ledger'}
            </p>
          </div>
        </div>

        {canIssueInvoices && (
          <button
            onClick={onOpenNewInvoice}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{t.btnIssueInvoice}</span>
          </button>
        )}
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400 block mb-0.5">{language === 'ar' ? 'إجمالي الفواتير الصادرة' : 'Total Billed'}</span>
          <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{totalBilled.toLocaleString()} SAR</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400 block mb-0.5">{language === 'ar' ? 'المحصل الفعلي (سندات القبض)' : 'Total Collected'}</span>
          <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{totalCollected.toLocaleString()} SAR</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400 block mb-0.5">{language === 'ar' ? 'المتبقي قيد التحصيل' : 'Pending Receivables'}</span>
          <span className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400">{totalPending.toLocaleString()} SAR</span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 border-b-2 cursor-pointer transition-colors ${
            activeTab === 'invoices'
              ? 'border-teal-600 text-teal-700 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {language === 'ar' ? 'قائمة الفواتير الطبية' : 'Invoices Directory'}
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 border-b-2 cursor-pointer transition-colors ${
            activeTab === 'ledger'
              ? 'border-teal-600 text-teal-700 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4 inline mr-1 text-amber-500" />
          {t.ledgerTitle}
        </button>
      </div>

      {activeTab === 'invoices' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left rtl:text-right">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">{t.invoiceNumber}</th>
                  <th className="px-4 py-3">{t.patient}</th>
                  <th className="px-4 py-3">{t.date}</th>
                  <th className="px-4 py-3">{t.totalAmount}</th>
                  <th className="px-4 py-3">{t.paidAmount}</th>
                  <th className="px-4 py-3">{t.paymentStatus}</th>
                  <th className="px-4 py-3">{t.paymentMethod}</th>
                  <th className="px-4 py-3 text-right rtl:text-left">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {clinicInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-teal-600 dark:text-teal-400">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {inv.patientName}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {inv.date}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                      {inv.totalAmount} SAR
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-600 font-semibold">
                      {inv.paidAmount} SAR
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          inv.paymentStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {inv.paymentStatus === 'paid' ? t.paid : inv.paymentStatus === 'partial' ? t.partial : t.unpaid}
                      </span>
                    </td>
                    <td className="px-4 py-3 uppercase font-mono text-slate-600 dark:text-slate-300">
                      {inv.paymentMethod}
                    </td>
                    <td className="px-4 py-3 text-right rtl:text-left">
                      <div className="flex items-center justify-end rtl:justify-start gap-1.5">
                        {inv.paymentStatus !== 'paid' && canCollectPayments && (
                          <button
                            onClick={() => handlePayBalance(inv)}
                            className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-medium cursor-pointer shadow-xs"
                          >
                            {language === 'ar' ? 'سداد المتبقي' : 'Pay Balance'}
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Print Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs space-y-4 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>{language === 'ar' ? 'سجل العمليات المحاسبية المقفلة' : 'Immutable Transaction Journal'}</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {language === 'ar'
                  ? 'سجلات قيود غير قابلة للتعديل أو الحذف لضمان معايير النزاهة والمطابقة المحاسبية'
                  : 'Tamper-proof audit records enforced by Firestore database security rules'}
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-mono font-bold text-teal-600">
              {clinicLedger.length} {language === 'ar' ? 'قيود مسجلة' : 'entries'}
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {clinicLedger.map(entry => (
              <div key={entry.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-mono font-bold text-xs">
                    ✓
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {entry.receiptNumber} · {entry.patientName}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(entry.timestamp).toLocaleString()} · Cashier: {entry.cashierName}
                    </span>
                  </div>
                </div>

                <div className="text-right rtl:text-left">
                  <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                    +{entry.amount} SAR
                  </span>
                  <span className="text-[10px] uppercase font-mono text-slate-400">
                    {entry.paymentMethod}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="text-center pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {language === 'ar' ? currentClinic.nameAr : currentClinic.name}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {selectedInvoice.invoiceNumber} · {selectedInvoice.date}
              </p>
            </div>

            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">{t.patient}:</span>
                <span className="font-bold">{selectedInvoice.patientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.paymentMethod}:</span>
                <span className="font-mono uppercase">{selectedInvoice.paymentMethod}</span>
              </div>
            </div>

            <div className="border-t border-b border-slate-100 py-3 space-y-1.5 text-xs">
              {selectedInvoice.items.map(it => (
                <div key={it.id} className="flex justify-between font-mono">
                  <span>{language === 'ar' ? it.descriptionAr : it.description}</span>
                  <span>{it.total} SAR</span>
                </div>
              ))}
            </div>

            <div className="text-xs space-y-1 font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{selectedInvoice.subtotal} SAR</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>VAT (15%):</span>
                <span>{selectedInvoice.tax} SAR</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>Total Paid:</span>
                <span className="text-teal-600">{selectedInvoice.paidAmount} SAR</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer"
              >
                {t.close}
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t.print}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
