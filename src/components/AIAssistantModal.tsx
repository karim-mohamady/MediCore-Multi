import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Bot, Send, Sparkles, MessageSquare, FileText, UserCheck } from 'lucide-react';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ isOpen, onClose }) => {
  const { language, currentClinic, appointments, queues, patients, invoices } = useApp();

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string }>>([
    {
      sender: 'assistant',
      text:
        language === 'ar'
          ? `مرحباً بك! أنا المساعد الذكي لإدارة تشغيل منشأة (${currentClinic.nameAr}). يمكنني تلخيص عبء الاستقبال اليومي، تحليل فترات الانتظار، أو صياغة تذكيرات المرضى.`
          : `Hello! I am your AI Operational Assistant for (${currentClinic.name}). I can summarize today's reception load, analyze queue bottlenecks, or draft patient reminders.`,
    },
  ]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const quickPrompts = [
    {
      icon: MessageSquare,
      labelAr: 'تلخيص عبء الاستقبال اليوم',
      labelEn: "Summarize today's reception load",
      queryAr: 'لخص لي حالة المواعيد والانتظار بالعيادة اليوم',
      queryEn: 'Summarize clinic appointments and waiting load for today',
    },
    {
      icon: FileText,
      labelAr: 'صياغة رسالة تذكير للمرضى',
      labelEn: 'Draft SMS reminder template',
      queryAr: 'صغ لي رسالة نصية تذكيرية رسمية للمرضى الذين لديهم مواعيد مسائية',
      queryEn: 'Draft a professional reminder SMS for patients with evening slots',
    },
    {
      icon: UserCheck,
      labelAr: 'تحليل متوسط وقت الانتظار',
      labelEn: 'Analyze average waiting bottleneck',
      queryAr: 'ما هو متوسط وقت انتظار المرضى حالياً وما التوصية لتحسينه؟',
      queryEn: 'What is the current estimated wait and how to optimize it?',
    },
  ];

  const handleSend = (textToSend?: string) => {
    const query = textToSend || prompt;
    if (!query.trim()) return;

    const userMsg = { sender: 'user' as const, text: query };
    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    setTimeout(() => {
      let reply = '';
      const waitingCount = queues.filter(q => q.clinicId === currentClinic.id && q.status === 'waiting').length;
      const todayApts = appointments.filter(a => a.clinicId === currentClinic.id && a.date === '2026-11-12').length;
      const totalRev = invoices
        .filter(i => i.clinicId === currentClinic.id)
        .reduce((sum, i) => sum + i.paidAmount, 0);

      if (query.includes('لخص') || query.includes('Summarize') || query.includes('عبء') || query.includes('load')) {
        reply =
          language === 'ar'
            ? `📊 تقرير الملخص التشغيلي للعيادة اليوم:
- إجمالي مواعيد اليوم المجدولة: ${todayApts} مواعيد.
- المرضى المنتظرون في الصالة حالياً: ${waitingCount} مريض.
- الإيرادات المحصلة اليوم حتى اللحظة: ${totalRev} ر.س.
- التوصية الإدارية: توزيع استقبال حالات الـ Walk-in على الفترات الأقل ضغطاً لتجنب تراكم الانتظار لدى عيادة د. طارق المنصور.`
            : `📊 Today's Operational Summary for ${currentClinic.name}:
- Total appointments scheduled: ${todayApts}.
- Patients currently waiting in hall: ${waitingCount}.
- Revenue collected so far: ${totalRev} SAR.
- Manager recommendation: Stagger walk-in intake during peak consultation intervals.`;
      } else if (query.includes('رسالة') || query.includes('تذكير') || query.includes('SMS') || query.includes('Draft')) {
        reply =
          language === 'ar'
            ? `📱 نموذج الرسالة النصية المقترح للمرضى:
"عزيزي المراجع، نذكرك بموعدك الطبي لدى ${currentClinic.nameAr} اليوم. نرجو الحضور قبل الموعد بـ 15 دقيقة لتسجيل العلامات الحيوية وإصدار تذكرة الدور. للاعتذار أو إعادة الجدولة يرجى الرد على هذه الرسالة."`
            : `📱 Suggested SMS reminder text:
"Dear patient, this is a reminder for your upcoming consultation at ${currentClinic.name} today. Please arrive 15 minutes early for vital signs intake and queue ticket. Reply to reschedule."`;
      } else {
        reply =
          language === 'ar'
            ? `✅ تحليل الذكاء الاصطناعي:
متوسط مدة الكشف الحالية هي 22 دقيقة لكل مريض. يبلغ وقت الانتظار الحالي التقريبي حوالي ${waitingCount * 15} دقيقة. المنظومة التشغيلية تسير بانتظام دون أي تعارضات مسجلة.`
            : `✅ AI Analytics insight:
Current average consultation cycle is 22 mins. Estimated waiting queue is approximately ${waitingCount * 15} mins. Operations are running within normal parameters.`;
      }

      setMessages(prev => [...prev, { sender: 'assistant', text: reply }]);
      setLoading(false);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[550px]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-teal-50/50 dark:bg-teal-950/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{language === 'ar' ? 'المساعد الإداري الذكي' : 'AI Clinic Assistant'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 font-medium">
                  Gemini API
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {language === 'ar' ? currentClinic.nameAr : currentClinic.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick prompt chips */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex gap-2 overflow-x-auto">
          {quickPrompts.map((qp, idx) => {
            const Icon = qp.icon;
            return (
              <button
                key={idx}
                onClick={() => handleSend(language === 'ar' ? qp.queryAr : qp.queryEn)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 whitespace-nowrap transition-colors cursor-pointer shrink-0"
              >
                <Icon className="w-3.5 h-3.5 text-teal-600" />
                <span>{language === 'ar' ? qp.labelAr : qp.labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* Message body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              <div
                className={`p-3 rounded-xl max-w-[85%] whitespace-pre-line leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-blue-700 text-white rounded-tr-none rtl:rounded-tr-xl rtl:rounded-tl-none'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none rtl:rounded-tl-xl rtl:rounded-tr-none border border-slate-200/60 dark:border-slate-700/60'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
              <Sparkles className="w-4 h-4 text-teal-500 animate-spin" />
              <span>{language === 'ar' ? 'جارٍ تحليل بيانات العيادة...' : 'Analyzing clinic data...'}</span>
            </div>
          )}
        </div>

        {/* Input box */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={
              language === 'ar'
                ? 'اطرح سؤالاً إدارياً أو تشغيلياً عن العيادة...'
                : 'Ask an operational question about clinic...'
            }
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={!prompt.trim() || loading}
            className="p-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
