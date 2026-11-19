import React from 'react';
import { useApp } from '../context/AppContext';
import { canAccessView } from '../lib/permissions';
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Users,
  Stethoscope,
  Receipt,
  FileSpreadsheet,
  ShieldAlert,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Tv,
} from 'lucide-react';

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  collapsed: boolean;
  setCollapsed: (val: boolean) => void;
  onOpenTV: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  collapsed,
  setCollapsed,
  onOpenTV,
}) => {
  const { t, language, queues, appointments, currentRole, currentClinic } = useApp();

  const waitingCount = queues.filter(q => q.status === 'waiting' && q.clinicId === currentClinic.id).length;
  const todayAptCount = appointments.filter(a => a.clinicId === currentClinic.id && a.date === '2026-11-12').length;

  const navItems = [
    {
      id: 'dashboard',
      label: t.navDashboard,
      icon: LayoutDashboard,
      roles: ['super_admin', 'clinic_owner', 'clinic_manager', 'doctor', 'receptionist', 'nurse', 'accountant'],
    },
    {
      id: 'queue',
      label: t.navQueue,
      icon: Clock,
      badge: waitingCount > 0 ? String(waitingCount) : undefined,
      badgeColor: 'bg-amber-500 text-white',
      roles: ['super_admin', 'clinic_owner', 'clinic_manager', 'doctor', 'receptionist', 'nurse'],
    },
    {
      id: 'appointments',
      label: t.navAppointments,
      icon: CalendarDays,
      badge: todayAptCount > 0 ? String(todayAptCount) : undefined,
      badgeColor: 'bg-blue-600 text-white',
      roles: ['super_admin', 'clinic_owner', 'clinic_manager', 'doctor', 'receptionist'],
    },
    {
      id: 'patients',
      label: t.navPatients,
      icon: Users,
      roles: ['super_admin', 'clinic_owner', 'clinic_manager', 'doctor', 'receptionist', 'nurse'],
    },
    {
      id: 'doctor-room',
      label: t.navDoctorWorkspace,
      icon: Stethoscope,
      roles: ['super_admin', 'clinic_owner', 'doctor', 'nurse'],
    },
    {
      id: 'billing',
      label: t.navBilling,
      icon: Receipt,
      roles: ['super_admin', 'clinic_owner', 'clinic_manager', 'accountant', 'receptionist'],
    },
    {
      id: 'excel',
      label: t.navExcel,
      icon: FileSpreadsheet,
      roles: ['super_admin', 'clinic_owner', 'clinic_manager', 'receptionist'],
    },
    {
      id: 'patient-portal',
      label: t.navPatientPortal,
      icon: Smartphone,
      roles: ['super_admin', 'patient', 'clinic_owner'],
    },
    {
      id: 'super-admin',
      label: t.navSuperAdmin,
      icon: ShieldAlert,
      roles: ['super_admin'],
    },
  ];

  const visibleNav = navItems.filter(item => canAccessView(currentRole, item.id));

  return (
    <aside
      className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r rtl:border-r-0 rtl:border-l border-slate-200 dark:border-slate-800 transition-all duration-200 z-30 shrink-0 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Sidebar Header / Collapse trigger */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100 dark:border-slate-800">
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {language === 'ar' ? 'القائمة الرئيسية' : 'Main Workspace'}
            </span>
            <span className="text-[11px] text-slate-400">
              {language === 'ar' ? currentClinic.code : currentClinic.code} · {currentClinic.plan}
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors mx-auto cursor-pointer"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {language === 'ar' ? (
            collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Nav List */}
      <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {visibleNav.map(item => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left rtl:text-right group ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`} />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Action: Launch TV Waiting Display */}
      <div className="p-2 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={onOpenTV}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-xs"
          title={language === 'ar' ? 'عرض شاشة صالة الانتظار التلفزيونية' : 'Open Waiting TV Display'}
        >
          <Tv className="w-4 h-4 text-teal-400 shrink-0" />
          {!collapsed && <span className="truncate">{t.btnOpenWaitingTV}</span>}
        </button>
      </div>
    </aside>
  );
};
