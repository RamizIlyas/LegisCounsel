import { DashboardLayout } from './DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { 
  Users, 
  Search, 
  TrendingUp, 
  Database,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import type { Page } from '../App';

interface AdminPanelProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

const searchData = [
  { month: 'Jan', searches: 4200 },
  { month: 'Feb', searches: 4800 },
  { month: 'Mar', searches: 5100 },
  { month: 'Apr', searches: 5500 },
  { month: 'May', searches: 6200 },
  { month: 'Jun', searches: 6800 }
];

const accuracyData = [
  { month: 'Jan', accuracy: 92 },
  { month: 'Feb', accuracy: 93 },
  { month: 'Mar', accuracy: 94 },
  { month: 'Apr', accuracy: 95 },
  { month: 'May', accuracy: 94 },
  { month: 'Jun', accuracy: 96 }
];

// const recentUsers = [
//   { id: '1', name: 'John Doe', email: 'john.doe@law.com', role: 'Lawyer', status: 'active', joined: '2025-10-15' },
//   { id: '2', name: 'Alice Client', email: 'alice@email.com', role: 'Client', status: 'active', joined: '2025-10-14' },
//   { id: '3', name: 'Robert Smith', email: 'robert.s@law.com', role: 'Lawyer', status: 'pending', joined: '2025-10-13' },
//   { id: '4', name: 'Maria Garcia', email: 'maria.g@email.com', role: 'Client', status: 'active', joined: '2025-10-12' },
//   { id: '5', name: 'James Wilson', email: 'james.w@law.com', role: 'Lawyer', status: 'inactive', joined: '2025-10-10' }
// ];

export function AdminPanel({ onNavigate, onLogout }: AdminPanelProps) {
  return (
    <DashboardLayout
      userRole="Admin"
      currentPage="admin"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-[#1E293B] mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">System overview and user management</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total Users
              </CardDescription>
              <CardTitle className="text-[#1E3A8A] text-3xl">12,487</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>+12.5% from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Active Searches
              </CardDescription>
              <CardTitle className="text-[#D4AF37] text-3xl">6,842</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>+18.2% from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Model Accuracy
              </CardDescription>
              <CardTitle className="text-[#1E3A8A] text-3xl">96.2%</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>+2.1% improvement</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Legal Documents
              </CardDescription>
              <CardTitle className="text-[#D4AF37] text-3xl">10.2M</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Updated daily</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#1E3A8A]" />
                Search Volume
              </CardTitle>
              <CardDescription>Monthly search activity over the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={searchData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Bar dataKey="searches" fill="#1E3A8A" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[#1E293B] flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#D4AF37]" />
                AI Model Accuracy
              </CardTitle>
              <CardDescription>Accuracy trends over the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={accuracyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" />
                  <YAxis domain={[90, 100]} stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="accuracy" 
                    stroke="#D4AF37" 
                    strokeWidth={3}
                    dot={{ fill: '#D4AF37', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[#1E293B]">System Health</CardTitle>
            <CardDescription>Real-time system performance metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">API Response Time</span>
                <span className="text-sm">142ms</span>
              </div>
              <Progress value={28} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Database Load</span>
                <span className="text-sm">54%</span>
              </div>
              <Progress value={54} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Server CPU</span>
                <span className="text-sm">38%</span>
              </div>
              <Progress value={38} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Memory Usage</span>
                <span className="text-sm">67%</span>
              </div>
              <Progress value={67} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
