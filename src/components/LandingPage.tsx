import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Scale, Brain, FileText, Users, Search, Sparkles, Shield, Zap } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import type { Page } from '../App';

interface LandingPageProps {
  onNavigate: (page: Page) => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top Navigation */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Scale className="h-8 w-8 text-[#1E3A8A]" />
              <span className="text-[#1E293B]" style={{ fontSize: '1.5rem', fontWeight: 600 }}>LegisCounsel</span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => onNavigate('login')}>
                Login
              </Button>
              <Button 
                onClick={() => onNavigate('signup')}
                className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1E3A8A] to-[#1E3A8A]/80">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 relative">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="text-white space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full backdrop-blur-sm">
                <Sparkles className="h-4 w-4 text-[#D4AF37]" />
                <span className="text-sm">Powered by Advanced AI & NLP</span>
              </div>
              <h1 className="text-5xl leading-tight" style={{ fontWeight: 700 }}>
                AI-Powered Intelligent Legal Argument Search
              </h1>
              <p className="text-xl text-white/90">
                Find relevant legal arguments, judgments, and statutes in seconds. Designed for lawyers, clients, and law students.
              </p>
              <div className="flex flex-wrap gap-4 pt-4">
                <Button 
                  size="lg"
                  onClick={() => onNavigate('login')}
                  className="bg-white text-[#1E3A8A] hover:bg-white/90"
                >
                  <Scale className="mr-2 h-5 w-5" />
                  Try as Lawyer
                </Button>
                <Button 
                  size="lg"
                  onClick={() => onNavigate('login')}
                  className="bg-[#D4AF37] text-white hover:bg-[#D4AF37]/90"
                >
                  <Users className="mr-2 h-5 w-5" />
                  Try as Client
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  onClick={() => onNavigate('login')}
                  className="bg-transparent border-2 border-white text-white hover:bg-white/10"
                >
                  Continue as Guest
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1590099543482-3b3d3083a474?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqdXN0aWNlJTIwbGF3JTIwdGVjaG5vbG9neXxlbnwxfHx8fDE3NjA4NjUzODh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                  alt="Legal Technology"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-[#D4AF37] rounded-full opacity-20 blur-3xl" />
              <div className="absolute -top-6 -left-6 w-32 h-32 bg-white rounded-full opacity-20 blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-[#1E293B] mb-4" style={{ fontSize: '2.5rem', fontWeight: 600 }}>
              Powerful Features for Legal Professionals
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto" style={{ fontSize: '1.125rem' }}>
              LegisCounsel combines cutting-edge AI technology with comprehensive legal databases to deliver precise results.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-2 hover:border-[#1E3A8A] transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-[#1E3A8A]/10 flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-[#1E3A8A]" />
                </div>
                <CardTitle>Semantic Search</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Natural language understanding to find relevant cases based on context, not just keywords.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-[#1E3A8A] transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center mb-4">
                  <Brain className="h-6 w-6 text-[#D4AF37]" />
                </div>
                <CardTitle>AI Summarization</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Get instant summaries of complex legal documents and judgments in plain language.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-[#1E3A8A] transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-[#1E3A8A]/10 flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-[#1E3A8A]" />
                </div>
                <CardTitle>Case References</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Access comprehensive citations and precedents with direct links to source documents.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-[#1E3A8A] transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-[#D4AF37]" />
                </div>
                <CardTitle>Lawyer-Client Connect</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Seamless communication platform connecting legal professionals with clients.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-[#1E3A8A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center text-white">
            <div>
              <div className="text-5xl mb-2" style={{ fontWeight: 700 }}>10M+</div>
              <div className="text-white/80">Legal Documents</div>
            </div>
            <div>
              <div className="text-5xl mb-2" style={{ fontWeight: 700 }}>95%</div>
              <div className="text-white/80">Accuracy Rate</div>
            </div>
            <div>
              <div className="text-5xl mb-2" style={{ fontWeight: 700 }}>50K+</div>
              <div className="text-white/80">Active Users</div>
            </div>
          </div>
        </div>
      </section>

      {/* Additional Features */}
      <section className="py-20 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-lg bg-[#1E3A8A] flex items-center justify-center">
                  <Shield className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-[#1E293B] mb-2">Secure & Confidential</h3>
                <p className="text-gray-600">
                  Bank-level encryption ensures your legal research and communications remain private.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-lg bg-[#D4AF37] flex items-center justify-center">
                  <Zap className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-[#1E293B] mb-2">Lightning Fast</h3>
                <p className="text-gray-600">
                  Get search results in milliseconds with our optimized AI infrastructure.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-lg bg-[#1E3A8A] flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-[#1E293B] mb-2">Continuously Updated</h3>
                <p className="text-gray-600">
                  Our database is updated daily with the latest judgments and legal developments.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1E293B] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Scale className="h-6 w-6 text-[#D4AF37]" />
                <span style={{ fontWeight: 600 }}>LegisCounsel</span>
              </div>
              <p className="text-white/70 text-sm">
                AI-powered legal research platform for modern legal professionals.
              </p>
            </div>
            <div>
              <h4 className="mb-4" style={{ fontWeight: 600 }}>Product</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4" style={{ fontWeight: 600 }}>Company</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4" style={{ fontWeight: 600 }}>Legal</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Disclaimer</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-8 text-center text-sm text-white/70">
            <p>© 2025 LegisCounsel. All rights reserved.</p>
            <p className="mt-2 text-xs">
              Legal Disclaimer: LegisCounsel is a research tool and does not provide legal advice. Consult a qualified attorney for legal matters.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
