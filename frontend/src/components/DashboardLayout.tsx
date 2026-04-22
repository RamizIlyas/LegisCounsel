//DashboardLayout.tsx
//Commented part is important DO NOT REMOVE
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import { useAuth } from '../contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  Menu,
  X,
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

interface MenuItem {
  icon: any;
  label: string;
  page: Page;
  badge?: string;
}

export function DashboardLayout({
  children,
  userRole,
  currentPage,
  onNavigate,
  onLogout,
  onRoleSwitch,
  searchBar,
}: DashboardLayoutProps) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [currentPage]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const baseMenuItems: MenuItem[] = [
    { icon: Home, label: 'Home', page: 'dashboard' as Page },
    { icon: MessageSquare, label: 'Communication', page: 'communication' as Page },
    { icon: Settings, label: 'Settings', page: 'settings' as Page },
  ];

  const clientMenuExtras: MenuItem[] = [
    { icon: FileSearch, label: 'Legal Search', page: 'dashboard' as Page },
    { icon: Bookmark, label: 'Bookmarks', page: 'bookmarks' as Page },
    // { icon: Bell, label: 'Notifications', badge: '3', page: 'dashboard' as Page },
    { icon: Briefcase, label: 'Case Management', page: 'cases' as Page },
  ];

  const adminMenuExtras: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Admin Panel', page: 'admin' as Page },
    { icon: Briefcase, label: 'Management Panel', page: 'management' as Page },
  ];

  const menuItems =
    userRole === 'admin'
      ? [baseMenuItems[0], ...adminMenuExtras, baseMenuItems[2]]
      : [baseMenuItems[0], ...clientMenuExtras, baseMenuItems[1], baseMenuItems[2]];

  const SidebarNav = () => (
    <nav className="p-4 space-y-1">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.page;

        return (
          <button
            key={item.label}
            onClick={() => {
              onNavigate(item.page);
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive
                ? 'bg-[#1E3A8A] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
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

      {/* Log out button at bottom of mobile drawer */}
      <div className="pt-4 border-t border-gray-100 md:hidden">
        <button
          onClick={() => {
            setSidebarOpen(false);
            onLogout();
          }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-left text-sm font-medium">Log Out</span>
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* ── Top Navbar ── */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">

            {/* Left: Hamburger (mobile) + Logo */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Hamburger — only visible on mobile */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-gray-600"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-2">
                <Scale className="h-7 w-7 text-[#1E3A8A]" />
                <span
                  className="text-[#1E293B] hidden sm:block"
                  style={{ fontSize: '1.25rem', fontWeight: 600 }}
                >
                  LegisCounsel
                </span>
              </div>
            </div>

            {/* Centre: Search bar */}
            {/* <div className="flex-1 max-w-2xl">
              {searchBar || (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search for legal arguments, precedents, or statutes..."
                    className="pl-10 bg-gray-50 border-gray-200 text-sm"
                  />
                </div>
              )}
            </div> */}

            {/* Right: Bell + Avatar */}
            <div className="flex items-center gap-2 shrink-0">
              {/*<Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </Button>*/}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-[#1E3A8A] text-white text-xs">
                        {user?.initials || (userRole === 'lawyer' ? 'LA' : userRole === 'client' ? 'RC' : 'AD')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:block text-left">
                      <div className="text-sm text-[#1E293B] leading-tight">
                        {user?.name ?? 'Guest'}
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

      {/* ── Mobile Sidebar Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile Slide-in Drawer ── */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-72 bg-white shadow-2xl
          transform transition-transform duration-300 ease-in-out
          md:hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-[#1E3A8A]" />
            <span className="text-[#1E293B] font-semibold text-lg">LegisCounsel</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="text-gray-500 hover:text-gray-800"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* User info strip */}
        <div className="flex items-center gap-3 px-5 py-4 bg-[#F0F4FF] border-b border-gray-100">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-[#1E3A8A] text-white text-sm">
              {userRole === 'lawyer' ? 'LA' : userRole === 'client' ? 'RC' : 'AD'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold text-[#1E293B]">{user?.name ?? 'Guest'}</div>
            <div className="text-xs text-gray-500 capitalize">{userRole}</div>
          </div>
        </div>

        {/* Nav items */}
        <div className="overflow-y-auto h-[calc(100%-8.5rem)]">
          <SidebarNav />
        </div>
      </aside>

      {/* ── Page body ── */}
      <div className="flex">
        {/* Desktop sidebar — hidden on mobile */}
        <aside className="hidden md:block w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)] sticky top-16 shrink-0">
          <SidebarNav />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}