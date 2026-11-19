import React from 'react';
import { useApp } from '../context/AppContext';
import { canAccessView } from '../lib/permissions';
import { LayoutDashboard, Clock, CalendarDays, Users, Stethoscope } from 'lucide-react';

interface BottomNavProps {
  activeView: string;
  setActiveView: (view: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView }) => {
  const { t, queues, currentClinic, currentRole } = useApp();
  const waitingCount = queues.filter(q => q.status === 'waiting' && q.clinicId === currentClinic.id).length;

  const items = [
    { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard },
    { id: 'queue', label: t.navQueue, icon: Clock, badge: waitingCount > 0 ? waitingCount : undefined },
    { id: 'appointments', label: t.navAppointments, icon: CalendarDays },
    { id: 'patients', label: t.navPatients, icon: Users },
    { id: 'doctor-room', label: t.navDoctorWorkspace, icon: Stethoscope },
  ].filter(item => canAccessView(currentRole, item.id));

  return (
    <nav aria-label="Mobile navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around py-1.5 px-2 shadow-lg">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-medium transition-colors relative cursor-pointer ${
              isActive
                ? 'text-blue-700 dark:text-blue-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5 mb-0.5" />
              {item.badge && (
                <span className="absolute -top-1 -right-2 bg-amber-500 text-white text-[9px] font-bold px-1 rounded-full font-mono">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="truncate max-w-[60px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
