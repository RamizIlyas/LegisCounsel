// LoginPage.tsx
import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft, X } from 'lucide-react';
import type { Page, UserRole } from '../App';
import { AuthIllustration } from './AuthIllustration';
import { toast } from "sonner";
import { useAuth } from '../contexts/AuthContext';

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5000";

interface LoginPageProps {
  onLogin: (role: UserRole) => void;
  onNavigate: (page: Page) => void;
}

export function LoginPage({ onLogin, onNavigate }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();

  // ── Forgot password state ──────────────────────────────────────────────────
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // ── Login submit ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Please fill in all fields");

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();

      if (!response.ok) return toast.error(data.message || "Invalid Credentials!");
      if (!data.user || !data.token) return toast.error("Invalid server response");
      if (!data.user.id || !data.user.email || !data.user.role || !data.user.name)
        return toast.error("Incomplete user data received");

      login(data.user, data.token);
      setPassword('');
      toast.success(`Welcome back, ${data.user.name}!`);
      onLogin(data.user.role);
    } catch (error) {
      console.error(error);
      toast.error("Server error. Please try again later.");
    }
  };

  // ── Forgot password submit ─────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return toast.error("Please enter your email address");

    setForgotLoading(true);
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await response.json();

      if (!response.ok) return toast.error(data.message || "Something went wrong");

      toast.success("A new password has been sent to your email!");
      setShowForgotModal(false);
      setForgotEmail('');
    } catch (error) {
      console.error(error);
      toast.error("Server error. Please try again later.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] grid md:grid-cols-2">

      <AuthIllustration />

      <div className="flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-md">

          <Button
            variant="ghost"
            onClick={() => onNavigate('landing')}
            className="mb-8 text-[#1E293B] hover:text-[#1E3A8A]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-[#1E293B]" style={{ fontSize: "2rem" }}>
                Sign In
              </CardTitle>
              <CardDescription>
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">

                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="lawyer@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-gray-300"
                  />
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-gray-300"
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded border-gray-300" />
                    <span className="text-gray-600">Remember me</span>
                  </label>
                  {/* ✅ Now opens the modal instead of linking nowhere */}
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="text-[#1E3A8A] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button type="submit" className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90">
                  Sign In
                </Button>

              </form>

              <div className="mt-6 text-center text-sm text-gray-600">
                Don't have an account?
                <button
                  onClick={() => onNavigate('signup')}
                  className="text-[#1E3A8A] hover:underline ml-1"
                >
                  Sign up
                </button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* ── Forgot Password Modal ─────────────────────────────────────────── */}
      {showForgotModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowForgotModal(false)}   // click backdrop to dismiss
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4 relative"
            onClick={(e) => e.stopPropagation()}       // prevent backdrop click inside
          >
            {/* Close button */}
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-semibold text-[#1E293B] mb-1">Reset Password</h2>
            <p className="text-sm text-gray-500 mb-6">
              Enter your registered email. We'll send a new temporary password instantly.
            </p>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <Label htmlFor="forgot-email">Email Address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="border-gray-300 mt-1"
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
              >
                {forgotLoading ? "Sending..." : "Send New Password"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}