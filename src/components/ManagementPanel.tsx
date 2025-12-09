import { DashboardLayout } from './DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Users, Database, CheckCircle2, XCircle, Clock, Search } from 'lucide-react';
import type { Page } from '../App';
import { Input } from './ui/input';
import { useState } from 'react';

interface ManagementProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

const recentUsers = [
  { id: '1', name: 'John Doe', email: 'john.doe@law.com', role: 'Lawyer', status: 'active', joined: '2025-10-15' },
  { id: '2', name: 'Alice Client', email: 'alice@email.com', role: 'Client', status: 'active', joined: '2025-10-14' },
  { id: '3', name: 'Robert Smith', email: 'robert.s@law.com', role: 'Lawyer', status: 'pending', joined: '2025-10-13' },
];

const lawData = [
  { id: "1", title: "Contract Act 1872", category: "Civil Law", updated: "2025-10-12" },
  { id: "2", title: "Criminal Procedure Code", category: "Criminal Law", updated: "2025-10-11" },
  { id: "3", title: "Family Courts Act", category: "Family Law", updated: "2025-10-09" }
];




export function ManagementPanel({ onNavigate, onLogout }: ManagementProps) {
      const [searchQuery, setSearchQuery] = useState('');
    const filteredUsers = recentUsers.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout
      userRole="Admin"
      currentPage="management"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="space-y-6">

        {/* USER MANAGEMENT */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-[#1E293B]">User Management</CardTitle>
                <CardDescription>Recently registered users</CardDescription>
              </div>
              <Button className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90">
                <Users className="mr-2 h-4 w-4" />
                Manage Users
              </Button>
            </div>
            <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search cases..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
          </CardHeader>

          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.name}</TableCell>
                      <TableCell className="text-gray-600">{user.email}</TableCell>

                      <TableCell>
                        <Badge variant="outline">
                          {user.role}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {user.status === 'active' && (
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                        {user.status === 'pending' && (
                          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                        {user.status === 'inactive' && (
                          <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell>{new Date(user.joined).toLocaleDateString()}</TableCell>

                      <TableCell>
                        <Button variant="ghost" size="sm">View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>

              </Table>
            </div>
          </CardContent>
        </Card>

        {/* LAWS MANAGEMENT */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-[#1E293B]">Laws Management</CardTitle>
                <CardDescription>Manage uploaded laws, categories, and metadata</CardDescription>
              </div>
              <Button className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white">
                <Database className="mr-2 h-4 w-4" />
                Manage Laws
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {lawData.map((law) => (
                    <TableRow key={law.id}>
                      <TableCell>{law.title}</TableCell>
                      <TableCell className="text-gray-600">{law.category}</TableCell>
                      <TableCell>{new Date(law.updated).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>

              </Table>
            </div>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
