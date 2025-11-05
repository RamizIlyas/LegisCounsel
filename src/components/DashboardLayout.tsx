import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { 
  Scale, 
  Search, 
  Home, 
  FileSearch, 
  Bookmark, 
  Bell, 
  Briefcase, 
  MessageSquare, 
  Settings,
  LogOut,
  LayoutDashboard,
  ArrowLeftRight
} from 'lucide-react';
import type { Page, UserRole } from '../App';

interface DashboardLayoutProps {
  children: ReactNode;
  userRole: UserRole;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  onRoleSwitch?: () => void;
  searchBar?: ReactNode;
}

export function DashboardLayout({ 
  children, 
  userRole, 
  currentPage,
  onNavigate, 
  onLogout,
  onRoleSwitch,
  searchBar
}: DashboardLayoutProps) {
  const menuItems = [
    { icon: Home, label: 'Home', page: 'dashboard' as Page },
    { icon: FileSearch, label: 'Legal Search', page: 'dashboard' as Page },
    { icon: Bookmark, label: 'Saved Cases', page: 'dashboard' as Page },
    { icon: Bell, label: 'Notifications', badge: '3', page: 'dashboard' as Page },
    { icon: Briefcase, label: 'Case Management', page: 'cases' as Page },
    { icon: MessageSquare, label: 'Communication', page: 'communication' as Page },
    { icon: Settings, label: 'Settings', page: 'settings' as Page },
  ];

  if (userRole === 'admin') {
    menuItems.splice(1, 0, { icon: LayoutDashboard, label: 'Admin Panel', page: 'admin' as Page });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6 flex-1">
              <div className="flex items-center gap-2">
                <Scale className="h-7 w-7 text-[#1E3A8A]" />
                <span className="text-[#1E293B] hidden sm:block" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  LegisCounsel
                </span>
              </div>
              
              {searchBar || (
                <div className="flex-1 max-w-2xl">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search for legal arguments, precedents, or statutes..."
                      className="pl-10 bg-gray-50 border-gray-200"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {userRole !== 'admin' && onRoleSwitch && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRoleSwitch}
                  className="hidden md:flex items-center gap-2 border-[#1E3A8A] text-[#1E3A8A] hover:bg-[#1E3A8A]/10"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  Switch to {userRole === 'lawyer' ? 'Client' : 'Lawyer'} View
                </Button>
              )}
              
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-[#1E3A8A] text-white">
                        {userRole === 'lawyer' ? 'JD' : userRole === 'client' ? 'AC' : 'AD'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:block text-left">
                      <div className="text-sm text-[#1E293B]">
                        {userRole === 'lawyer' ? 'John Doe' : userRole === 'client' ? 'Alice Client' : 'Admin User'}
                      </div>
                      <div className="text-xs text-gray-500 capitalize">{userRole}</div>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onNavigate('settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  {userRole !== 'admin' && onRoleSwitch && (
                    <DropdownMenuItem onClick={onRoleSwitch} className="md:hidden">
                      <ArrowLeftRight className="mr-2 h-4 w-4" />
                      Switch to {userRole === 'lawyer' ? 'Client' : 'Lawyer'} View
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout} className="text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Left Sidebar */}
        <aside className="hidden md:block w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)] sticky top-16">
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              
              return (
                <button
                  key={item.label}
                  onClick={() => onNavigate(item.page)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive 
                      ? 'bg-[#1E3A8A] text-white' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <Badge 
                      variant="secondary" 
                      className={isActive ? 'bg-white/20 text-white' : 'bg-[#D4AF37] text-white'}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
