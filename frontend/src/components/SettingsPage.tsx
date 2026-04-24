// SettingsPage.tsx
import { useState } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Separator } from './ui/separator';
import {
  User,
  Shield,
  Save,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import type { Page, UserRole } from '../App';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5000";

interface SettingsPageProps {
  userRole: UserRole;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  onRoleSwitch?: () => void;
}

// ── Safe JSON parser — never throws on empty body ────────────────────────────
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: `Unexpected server response (HTTP ${res.status})` };
  }
}

// ── Inline alert ─────────────────────────────────────────────────────────────
function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
  const ok = type === 'success';
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm font-medium border ${
        ok
          ? 'bg-green-50 text-green-800 border-green-200'
          : 'bg-red-50 text-red-800 border-red-200'
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      {message}
    </div>
  );
}

// ── Password field with eye toggle ────────────────────────────────────────────
function PasswordInput({
  id,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        placeholder={placeholder ?? '••••••••'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ── Delete confirmation dialog ────────────────────────────────────────────────
function DeleteConfirmDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 rounded-full bg-red-100 p-2">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Delete Account</h3>
            <p className="text-sm text-gray-500">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-gray-700">
          All your data — cases, messages, and documents — will be permanently deleted.
          Are you sure you want to continue?
        </p>
        <div className="flex gap-3 pt-1">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</>
            ) : (
              'Yes, delete'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SettingsPage({ userRole, onNavigate, onLogout, onRoleSwitch }: SettingsPageProps) {
  const { user, login, logout } = useAuth();

  const token = localStorage.getItem('token');
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // ── Profile ────────────────────────────────────────────────────────────────
  const [profileData, setProfileData] = useState({
    name:
      user?.name ??
      (userRole === 'lawyer' ? 'John Doe' : userRole === 'client' ? 'Alice Client' : 'Admin User'),
    email:
      user?.email ??
      (userRole === 'lawyer' ? 'john.doe@law.com' : 'alice@email.com'),
    phone: '',
    location: '',
    organization: userRole === 'lawyer' ? '' : 'N/A',
  });
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const handleSaveProfile = async () => {
    if (!profileData.name.trim() || !profileData.email.trim()) {
      setProfileStatus({ type: 'error', message: 'Name and email are required.' });
      return;
    }
    setProfileLoading(true);
    setProfileStatus(null);
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/users/profile`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          name: profileData.name.trim(),
          email: profileData.email.trim(),
          mobile: profileData.phone.trim(),
          location: profileData.location.trim(),
          firm: profileData.organization.trim(),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message ?? 'Failed to update profile.');
      login(
        { id: user!.id, name: data.user.name, email: data.user.email, role: data.user.role },
        token!
      );
      setProfileStatus({ type: 'success', message: 'Profile updated successfully.' });
    } catch (err: any) {
      setProfileStatus({ type: 'error', message: err.message ?? 'Something went wrong.' });
    } finally {
      setProfileLoading(false);
    }
  };

  // ── Password ───────────────────────────────────────────────────────────────
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!passwords.current || !passwords.next || !passwords.confirm) {
      setPasswordStatus({ type: 'error', message: 'All password fields are required.' });
      return;
    }
    if (passwords.next.length < 8) {
      setPasswordStatus({ type: 'error', message: 'New password must be at least 8 characters.' });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    setPasswordLoading(true);
    setPasswordStatus(null);
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/users/change-password`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message ?? 'Failed to update password.');
      setPasswordStatus({ type: 'success', message: 'Password updated successfully.' });
      setPasswords({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      setPasswordStatus({ type: 'error', message: err.message ?? 'Something went wrong.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── Delete account ─────────────────────────────────────────────────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/users/profile`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message ?? 'Failed to delete account.');
      logout();   // clears localStorage + AuthContext
      onLogout(); // navigate to login
    } catch (err: any) {
      setDeleteError(err.message ?? 'Something went wrong.');
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout
      userRole={userRole}
      currentPage="settings"
      onNavigate={onNavigate}
      onLogout={onLogout}
      onRoleSwitch={onRoleSwitch}
    >
      {showDeleteDialog && (
        <DeleteConfirmDialog
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteDialog(false)}
          loading={deleteLoading}
        />
      )}

      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-[#1E293B] mb-2">Settings</h1>
          <p className="text-gray-600">Manage your account settings and preferences</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ───────────────────────────────────────────── */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>Update your personal information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-6">
                  <Avatar className="h-24 w-24">
                    <AvatarFallback className="bg-[#1E3A8A] text-white text-2xl">
                      {user?.initials ??
                        (userRole === 'lawyer' ? 'JD' : userRole === 'client' ? 'AC' : 'AD')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-800">{profileData.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{userRole}</p>
                  </div>
                </div>

                <Separator />

                {/* Form */}
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        value={profileData.name}
                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="email"
                          className="pl-10"
                          value={profileData.email}
                          onChange={(e) =>
                            setProfileData({ ...profileData, email: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="phone"
                          className="pl-10"
                          value={profileData.phone}
                          onChange={(e) =>
                            setProfileData({ ...profileData, phone: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="location"
                          className="pl-10"
                          value={profileData.location}
                          onChange={(e) =>
                            setProfileData({ ...profileData, location: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {userRole === 'lawyer' && (
                    <div className="space-y-2">
                      <Label htmlFor="organization">Law Firm / Organization</Label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="organization"
                          className="pl-10"
                          value={profileData.organization}
                          onChange={(e) =>
                            setProfileData({ ...profileData, organization: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                {profileStatus && (
                  <Alert type={profileStatus.type} message={profileStatus.message} />
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={profileLoading}
                    className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 min-w-[130px]"
                  >
                    {profileLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                    ) : (
                      <><Save className="mr-2 h-4 w-4" />Save Changes</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-red-800">Danger Zone</CardTitle>
                <CardDescription className="text-red-600">
                  This will permanently delete your account and all associated data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {deleteError && <Alert type="error" message={deleteError} />}
                <Button
                  variant="destructive"
                  onClick={() => { setDeleteError(null); setShowDeleteDialog(true); }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Security Tab ──────────────────────────────────────────── */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security Settings
                </CardTitle>
                <CardDescription>Manage your password and security preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <PasswordInput
                      id="current-password"
                      value={passwords.current}
                      onChange={(v) => setPasswords({ ...passwords, current: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <PasswordInput
                      id="new-password"
                      value={passwords.next}
                      onChange={(v) => setPasswords({ ...passwords, next: v })}
                    />
                    <p className="text-xs text-gray-500">Minimum 8 characters</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <PasswordInput
                      id="confirm-password"
                      value={passwords.confirm}
                      onChange={(v) => setPasswords({ ...passwords, confirm: v })}
                    />
                  </div>
                </div>

                {passwordStatus && (
                  <Alert type={passwordStatus.type} message={passwordStatus.message} />
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={handleChangePassword}
                    disabled={passwordLoading}
                    className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 min-w-[150px]"
                  >
                    {passwordLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</>
                    ) : (
                      'Update Password'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}