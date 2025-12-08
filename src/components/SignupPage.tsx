// SignupPage.tsx
import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft } from 'lucide-react';
import type { Page, UserRole} from '../App';
import { AuthIllustration } from './AuthIllustration';
import axios from "axios";
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

interface SignupPageProps {
  onLogin: (role: UserRole) => void;
  onNavigate: (page: Page) => void;
}

export function SignupPage({ onLogin, onNavigate }: SignupPageProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'lawyer' | 'client' | 'admin'>('lawyer');
  const { login } = useAuth();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) return toast("Please fill in all fields");

    try {
    const res = await axios.post("http://localhost:5000/api/auth/signup", {
    name,
    email,
    password,
    role
    });
    console.log(res.data);

    if (res.data.success) {
        // Store user data in context
        login(res.data.user, res.data.token); // ✅ CALL AUTH CONTEXT LOGIN
        
        toast.success(`Account created successfully! Welcome, ${res.data.user.name}`);
    }
    toast(res.data.message);
    onLogin(role);  // or redirect user to login

    } catch (error: any) {
    if (error.response) {
      // THIS is your backend error message
      toast.error(error.response.data.message);
    } else {
      toast.error("Something went wrong");
    }
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
                Create Account
              </CardTitle>
              <CardDescription>
                Get started with LegisCounsel today
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">

                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Ali Muhammad"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="border-gray-300"
                  />
                </div>

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

                <div>
                  <Label>I am a...</Label>
                  <Select value={role} onValueChange={(value) => setRole(value as any)}>
                    <SelectTrigger className="border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lawyer">Lawyer / Legal Professional</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90">
                  Create Account
                </Button>

              </form>

              <div className="mt-6 text-center text-sm text-gray-600">
                Already have an account?
                <button
                  onClick={() => onNavigate('login')}
                  className="text-[#1E3A8A] hover:underline ml-1"
                >
                  Sign in
                </button>
              </div>

            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
