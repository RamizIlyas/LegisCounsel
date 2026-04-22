// ClientDashboard.tsx
import { AiChatInterface } from './AiChatInterface';
import { DashboardLayout } from './DashboardLayout';
import type { Page } from '../App';

interface ClientDashboardProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  onRoleSwitch: () => void;
}

export function ClientDashboard({ onNavigate, onLogout, onRoleSwitch }: ClientDashboardProps) {
  return (
    <DashboardLayout
      userRole="client"
      currentPage="dashboard"
      onNavigate={onNavigate}
      onLogout={onLogout}
      onRoleSwitch={onRoleSwitch}
    >
      <AiChatInterface
        onConnectWithLawyer={() => onNavigate('communication')}
        onRoleSwitch={onRoleSwitch}
      />
    </DashboardLayout>
  );
}