import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Scale, ArrowLeft } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import type { Page, UserRole } from '../App';
// import { toast } from 'sonner@2.0.3';

interface LoginPageProps {
  mode: 'login' | 'signup';
  onLogin: (role: UserRole) => void;
  onNavigate: (page: Page) => void;
}

export function LoginPage({ mode, onLogin, onNavigate }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'lawyer' | 'client' | 'admin'>('lawyer');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      alert(`Successfully ${mode === 'login' ? 'logged in' : 'registered'} as ${role}`);
      onLogin(role);
    } else {
      alert('Please fill in all fields');
    }
  };

  const handleGuestAccess = () => {
    alert('Continuing as guest (Lawyer view)');
    onLogin('lawyer');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] grid md:grid-cols-2">
      {/* Left Side - Illustration */}
      <div className="hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-[#1E3A8A] to-[#1E3A8A]/80 p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        </div>
        <div className="relative z-10 max-w-md">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <Scale className="h-10 w-10 text-[#D4AF37]" />
              <span className="text-white text-3xl" style={{ fontWeight: 700 }}>LegisCounsel</span>
            </div>
            <h2 className="text-white text-4xl mb-4" style={{ fontWeight: 600 }}>
              Welcome to the Future of Legal Research
            </h2>
            <p className="text-white/80 text-lg">
              Access millions of legal documents, powered by advanced AI to find exactly what you need.
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-2xl">
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1748346918817-0b1b6b2f9bab?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBvZmZpY2UlMjBwcm9mZXNzaW9uYWx8ZW58MXx8fHwxNzYwNzkxMDMxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
              alt="Professional workspace"
              className="w-full h-80 object-cover"
            />
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-md">
          <Button
            variant="ghost"
            onClick={() => onNavigate('landing')}
            className="mb-8 text-[#1E293B] hover:text-[#1E3A8A]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>

          <Card className="border-2">
            <CardHeader className="space-y-1">
              <CardTitle className="text-[#1E293B]" style={{ fontSize: '2rem' }}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </CardTitle>
              <CardDescription>
                {mode === 'login' 
                  ? 'Enter your credentials to access your account'
                  : 'Get started with LegisCounsel today'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
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

                <div className="space-y-2">
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

                <div className="space-y-2">
                  <Label htmlFor="role">I am a...</Label>
                  <Select value={role} onValueChange={(value) => setRole(value as any)}>
                    <SelectTrigger id="role" className="border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lawyer">Lawyer / Legal Professional</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mode === 'login' && (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-gray-300" />
                      <span className="text-gray-600">Remember me</span>
                    </label>
                    <a href="#" className="text-[#1E3A8A] hover:underline">
                      Forgot password?
                    </a>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
                >
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
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
                  className="w-full border-2 border-[#D4AF37] text-[#1E293B] hover:bg-[#D4AF37]/10"
                  onClick={handleGuestAccess}
                >
                  Continue as Guest
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-gray-600">
                {mode === 'login' ? (
                  <p>
                    Don't have an account?{' '}
                    <button
                      onClick={() => onNavigate('signup')}
                      className="text-[#1E3A8A] hover:underline"
                    >
                      Sign up
                    </button>
                  </p>
                ) : (
                  <p>
                    Already have an account?{' '}
                    <button
                      onClick={() => onNavigate('login')}
                      className="text-[#1E3A8A] hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-gray-500">
            By continuing, you agree to our{' '}
            <a href="#" className="text-[#1E3A8A] hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-[#1E3A8A] hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
