import React from 'react';
import { useApp } from '../context/AppContext';
import { canAccessView, getDefaultViewForRole } from '../lib/permissions';
import {
  Globe,
  Moon,
  Sun,
  Bot,
  Database,
  PlusCircle,
  Bell,
  Stethoscope,
} from 'lucide-react';

interface HeaderProps {
  onOpenAI: () => void;
  onOpenFirebase: () => void;
  onOpenOnboarding: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAI,
  onOpenFirebase,
  onOpenOnboarding,
  activeView,
  setActiveView,
}) => {
  const { language, setLanguage, theme, toggleTheme, t, currentUser, currentRole, currentClinic } = useApp();

  const headerNavItems = [
    { id: 'dashboard', label: t.navDashboard },
    { id: 'queue', label: t.navQueue },
    { id: 'appointments', label: t.navAppointments },
    { id: 'patients', label: t.navPatients },
    { id: 'doctor-room', label: t.navDoctorWorkspace },
  ].filter(item => canAccessView(currentRole, item.id));

  return (
    <header className="sticky top-0 z-40 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-8 h-16">
        {/* Zone 1: Single element brand wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveView(getDefaultViewForRole(currentRole))}
            className="flex items-center gap-2.5 text-left rtl:text-right group cursor-pointer focus:outline-none"
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-700 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                MediCore
              </span>
              <span className="text-[11px] font-medium text-teal-600 dark:text-teal-400 -mt-1 truncate max-w-[150px]">
                {language === 'ar' ? currentClinic.nameAr : currentClinic.name}
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Clean single-line text navigation links filtered by role */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {headerNavItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`whitespace-nowrap transition-colors cursor-pointer hover:text-blue-700 dark:hover:text-blue-400 ${
                activeView === item.id ? 'text-blue-700 dark:text-blue-400 font-semibold' : ''
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary action + utility controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* AI Clinic Assistant Button */}
          <button
            onClick={onOpenAI}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Bot className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="hidden sm:inline">{t.aiAssistant}</span>
          </button>

          {/* Firebase Rules & Config Button */}
          <button
            onClick={onOpenFirebase}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden md:inline">{t.firebaseSettings}</span>
          </button>

          {/* Onboard Clinic Wizard */}
          {(currentRole === 'super_admin' || currentRole === 'clinic_owner') && (
            <button
              onClick={onOpenOnboarding}
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-blue-700 hover:bg-blue-800 transition-colors whitespace-nowrap shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{t.onboardClinic}</span>
            </button>
          )}

          <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block mx-1" />

          {/* Language Toggle (AR / EN) */}
          <button
            onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="Toggle Language"
            aria-label="Toggle language"
          >
            <Globe className="w-4 h-4" />
            <span>{language === 'ar' ? 'EN' : 'عربي'}</span>
          </button>

          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Toggle Dark Mode"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* User Avatar */}
          <div className="flex items-center gap-2 pl-1 rtl:pl-0 rtl:pr-1">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600">
              {currentUser.name.charAt(0)}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
