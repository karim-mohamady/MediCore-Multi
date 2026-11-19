import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { hasRolePermission } from '../lib/permissions';
import { X, Receipt, Plus, Trash2 } from 'lucide-react';
import { InvoiceItem } from '../types';

interface NewInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewInvoiceModal: React.FC<NewInvoiceModalProps> = ({ isOpen, onClose }) => {
  const { language, currentRole, patients, createInvoice } = useApp();
  const canCollectPayments = hasRolePermission(currentRole, 'canCollectPayments');

  const [patientId, setPatientId] = useState(patients[0]?.id || '');
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: 'it-1',
      description: 'Specialist Medical Consultation',
      descriptionAr: 'كشف استشاري متخصص',
      quantity: 1,
      unitPrice: 350,
      total: 350,
    },
  ]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'insurance'>('card');
  const [payNow, setPayNow] = useState<boolean>(canCollectPayments);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPayNow(canCollectPayments);
      setErrorMsg('');
      if (!patientId && patients[0]?.id) {
        setPatientId(patients[0].id);
      }
    }
  }, [isOpen, canCollectPayments, patientId, patients]);

  if (!isOpen) return null;

  const subtotal = items.reduce((acc, it) => acc + it.total, 0);
  const tax = Math.round((subtotal - discount) * 0.15 * 100) / 100; // 15% VAT
  const totalAmount = Math.max(0, subtotal - discount + tax);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: `it-${Date.now()}`,
        description: 'Routine ECG / Diagnostic Test',
        descriptionAr: 'تخطيط قلب أو فحص تشخيصي',
        quantity: 1,
        unitPrice: 150,
        total: 150,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(it => it.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const targetPat = patients.find(p => p.id === patientId) || patients[0];
    if (!targetPat) {
      setErrorMsg(language === 'ar' ? 'يرجى تسجيل مريض أولاً' : 'Please register a patient first.');
      return;
    }

    if (discount < 0 || items.some(it => it.unitPrice < 0 || it.quantity <= 0)) {
      setErrorMsg(
        language === 'ar'
          ? 'يرجى التأكد من صحة أسعار البنود وقيمة الخصم.'
          : 'Please ensure item prices, quantities, and discount amounts are valid.'
      );
      return;
    }
    if (totalAmount <= 0) {
      setErrorMsg(
        language === 'ar'
          ? 'يجب أن يكون إجمالي الفاتورة أكبر من صفر.'
          : 'Invoice total amount must be greater than zero.'
      );
      return;
    }

    const collectImmediate = canCollectPayments && payNow;
    try {
      await createInvoice(
        {
          patientId: targetPat.id,
          patientName: targetPat.name,
          date: new Date().toISOString().split('T')[0],
          items,
          subtotal,
          tax,
          discount,
          totalAmount,
          paidAmount: collectImmediate ? totalAmount : 0,
          paymentStatus: collectImmediate ? 'paid' : 'unpaid',
          paymentMethod,
          notes: collectImmediate ? 'Settled on registration' : 'Pending payment',
        },
        collectImmediate ? totalAmount : 0
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'ar' ? 'إصدار فاتورة طبية وسند تحصيل' : 'Create Medical Invoice & Receipt'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}
          <div>
            <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
              {language === 'ar' ? 'المريض المستفيد' : 'Patient'}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {language === 'ar' ? 'بنود الخدمات والإجراءات' : 'Service Items'}
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'إضافة بند' : 'Add Item'}</span>
              </button>
            </div>

            {items.map((it, idx) => (
              <div key={it.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <input
                  type="text"
                  value={language === 'ar' ? it.descriptionAr : it.description}
                  onChange={e => {
                    const newItems = [...items];
                    newItems[idx].description = e.target.value;
                    newItems[idx].descriptionAr = e.target.value;
                    setItems(newItems);
                  }}
                  className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  type="number"
                  value={it.unitPrice}
                  onChange={e => {
                    const val = Number(e.target.value);
                    const newItems = [...items];
                    newItems[idx].unitPrice = val;
                    newItems[idx].total = val * newItems[idx].quantity;
                    setItems(newItems);
                  }}
                  className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono text-right"
                />
                <span className="text-slate-500 font-mono text-[11px]">{language === 'ar' ? 'ر.س' : 'SAR'}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(it.id)}
                    className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'الخصم (ر.س)' : 'Discount (SAR)'}
              </label>
              <input
                type="number"
                value={discount}
                onChange={e => setDiscount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                {language === 'ar' ? 'طريقة السداد' : 'Payment Method'}
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="card">{language === 'ar' ? 'بطاقة بنكية / مدى' : 'Card / Mada'}</option>
                <option value="cash">{language === 'ar' ? 'نقداً' : 'Cash'}</option>
                <option value="insurance">{language === 'ar' ? 'تأمين طبي' : 'Insurance'}</option>
              </select>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 space-y-1 font-mono text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>{language === 'ar' ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
              <span>{subtotal.toFixed(2)} SAR</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>{language === 'ar' ? 'ضريبة القيمة المضافة (15%):' : 'VAT (15%):'}</span>
              <span>{tax.toFixed(2)} SAR</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-300 dark:border-slate-700">
              <span>{language === 'ar' ? 'الإجمالي النهائي:' : 'Total Amount:'}</span>
              <span className="text-teal-600 dark:text-teal-400">{totalAmount.toFixed(2)} SAR</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="payNow"
                checked={canCollectPayments && payNow}
                onChange={e => {
                  if (!canCollectPayments) return;
                  setPayNow(e.target.checked);
                }}
                aria-readonly={!canCollectPayments}
                className="rounded text-teal-600 cursor-pointer"
              />
              <label htmlFor="payNow" className="text-slate-700 dark:text-slate-300 cursor-pointer">
                {language === 'ar' ? 'تحصيل وتسديد الفاتورة فوراً وإصدار سند قبض' : 'Collect payment now and issue official receipt'}
              </label>
            </div>
            {!canCollectPayments && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 pl-6 rtl:pl-0 rtl:pr-6">
                {language === 'ar'
                  ? 'تحصيل المدفوعات متاح للمحاسب أو مدير العيادة فقط — سيتم إصدار الفاتورة غير مسددة.'
                  : 'Payment collection requires Accountant or Manager role — invoice will be issued as unpaid.'}
              </p>
            )}
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
              {language === 'ar' ? 'حفظ وإصدار الفاتورة' : 'Generate Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
