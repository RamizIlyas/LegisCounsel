import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { LoginPage } from './components/LoginPage';
import { LawyerDashboard } from './components/LawyerDashboard';
import { ClientDashboard } from './components/ClientDashboard';
import { CaseManagement } from './components/CaseManagement';
import { Communication } from './components/Communication';
import { AdminPanel } from './components/AdminPanel';
import { SettingsPage } from './components/SettingsPage';
import { Toaster } from './components/ui/sonner';

export type UserRole = 'lawyer' | 'client' | 'admin' | null;

export type Page = 'landing' | 'login' | 'signup' | 'dashboard' | 'cases' | 'communication' | 'admin' | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = (role: UserRole) => {
    setUserRole(role);
    setIsAuthenticated(true);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setUserRole(null);
    setIsAuthenticated(false);
    setCurrentPage('landing');
  };

  const handleNavigation = (page: Page) => {
    setCurrentPage(page);
  };

  const handleRoleSwitch = () => {
    if (userRole === 'lawyer') {
      setUserRole('client');
    } else if (userRole === 'client') {
      setUserRole('lawyer');
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return <LandingPage onNavigate={handleNavigation} />;
      case 'login':
      case 'signup':
        return <LoginPage mode={currentPage} onLogin={handleLogin} onNavigate={handleNavigation} />;
      case 'dashboard':
        if (userRole === 'admin') {
          return <AdminPanel onNavigate={handleNavigation} onLogout={handleLogout} />;
        }
        return userRole === 'lawyer' 
          ? <LawyerDashboard onNavigate={handleNavigation} onLogout={handleLogout} onRoleSwitch={handleRoleSwitch} />
          : <ClientDashboard onNavigate={handleNavigation} onLogout={handleLogout} onRoleSwitch={handleRoleSwitch} />;
      case 'cases':
        return <CaseManagement userRole={userRole} onNavigate={handleNavigation} onLogout={handleLogout} />;
      case 'communication':
        return <Communication userRole={userRole} onNavigate={handleNavigation} onLogout={handleLogout} />;
      case 'admin':
        return <AdminPanel onNavigate={handleNavigation} onLogout={handleLogout} />;
      case 'settings':
        return <SettingsPage userRole={userRole} onNavigate={handleNavigation} onLogout={handleLogout} onRoleSwitch={handleRoleSwitch} />;
      default:
        return <LandingPage onNavigate={handleNavigation} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {renderPage()}
      <Toaster />
    </div>
  );
}
