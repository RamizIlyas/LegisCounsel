// LoginPage.tsx
import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft } from 'lucide-react';
import type { Page, UserRole } from '../App';
import { AuthIllustration } from './AuthIllustration';
import { toast } from "sonner";
import { useAuth} from '../contexts/AuthContext';
interface LoginPageProps {
  onLogin: (role: UserRole) => void;
  onNavigate: (page: Page) => void;
}

export function LoginPage({ onLogin, onNavigate }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // const [role, setRole] = useState<'lawyer' | 'client' | 'admin'>('lawyer');// not needed in login as role is determined by backend
  const { login } = useAuth();
  
  
  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Please fill in all fields");
    try{
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email:email.trim(), password }),
    });
    const data = await response.json();

    if (!response.ok) {
      // If login failed
      return toast.error(data.message || "Invalid Credentials !");
    }

    // Validate response structure
    if (!data.user || !data.token) {
      console.error('Invalid response structure:', data);
      return toast.error("Invalid server response");
    }

    // ✅ Validate required user fields
    if (!data.user.id || !data.user.email || !data.user.role || !data.user.name) {
      console.error('Missing user fields:', data.user);
      return toast.error("Incomplete user data received");
    }

    login(data.user, data.token); // ✅ CALL AUTH CONTEXT LOGIN

    setPassword('');// ✅ Clear password field for security
    
    toast.success(`Welcome back, ${data.user.name}!`);// ✅ Show success message
    toast.success(`Successfully logged in as ${data.user.role}`);
    
    onLogin(data.user.role);

  } catch (error) {
    console.error(error);
    toast("Server error. Please try again later.");
  }
}

  const handleGuestAccess = () => {
    toast('Continuing as guest (Lawyer view)');
    onLogin('lawyer');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] grid md:grid-cols-2">

      {/* Left side illustration */}
      <AuthIllustration />

      {/* Right Side */}
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

                {/* <div>
                  <Label htmlFor="role">I am a...</Label>
                  <Select value={role} onValueChange={(r) => setRole(r as any)}>
                    <SelectTrigger className="border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lawyer">Lawyer / Legal Professional</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div> */}

                {/* Remember me */}
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded border-gray-300" />
                    <span className="text-gray-600">Remember me</span>
                  </label>
                  <a className="text-[#1E3A8A] hover:underline" href="#">
                    Forgot password?
                  </a>
                </div>

                <Button type="submit" className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90">
                  Sign In
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">OR</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-2 border-[#D4AF37] text-[#1E293B]"
                  onClick={handleGuestAccess}
                >
                  Continue as Guest
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
    </div>
  );
}
