import { useState } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Calendar } from './ui/calendar';
import { 
  Plus, 
  Search, 
  FileText, 
  Calendar as CalendarIcon, 
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  MoreVertical,
  Edit,
  Trash2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import type { Page, UserRole } from '../App';
import { toast } from "sonner";

interface CaseManagementProps {
  userRole: UserRole;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

interface Case {
  id: string;
  name: string;
  client: string;
  status: 'active' | 'pending' | 'closed';
  nextHearing: string;
  filedDate: string;
  caseType: string;
}

const mockCases: Case[] = [
  {
    id: '1',
    name: 'Smith v. Johnson Corp.',
    client: 'Michael Smith',
    status: 'active',
    nextHearing: '2025-11-15',
    filedDate: '2025-01-10',
    caseType: 'Employment Law'
  },
  {
    id: '2',
    name: 'Estate of Williams',
    client: 'Sarah Williams',
    status: 'pending',
    nextHearing: '2025-11-20',
    filedDate: '2025-02-14',
    caseType: 'Estate Planning'
  },
  {
    id: '3',
    name: 'Martinez v. City Council',
    client: 'Carlos Martinez',
    status: 'active',
    nextHearing: '2025-11-08',
    filedDate: '2024-12-05',
    caseType: 'Civil Rights'
  },
  {
    id: '4',
    name: 'Thompson Real Estate Dispute',
    client: 'Jennifer Thompson',
    status: 'closed',
    nextHearing: '2025-09-30',
    filedDate: '2024-11-20',
    caseType: 'Property Law'
  }
];

export function CaseManagement({ userRole, onNavigate, onLogout }: CaseManagementProps) {
  const [cases, setCases] = useState<Case[]>(mockCases);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  const [newCase, setNewCase] = useState({
    name: '',
    client: '',
    caseType: '',
    nextHearing: ''
  });

  const handleAddCase = () => {
    if (newCase.name && newCase.client && newCase.caseType) {
      const caseToAdd: Case = {
        id: Date.now().toString(),
        name: newCase.name,
        client: newCase.client,
        status: 'active',
        nextHearing: newCase.nextHearing || '2025-12-01',
        filedDate: new Date().toISOString().split('T')[0],
        caseType: newCase.caseType
      };
      setCases([...cases, caseToAdd]);
      setShowAddDialog(false);
      setNewCase({ name: '', client: '', caseType: '', nextHearing: '' });
      toast('Case added successfully');
    } else {
      toast('Please fill in all required fields');
    }
  };

  const handleDeleteCase = (id: string) => {
    setCases(cases.filter(c => c.id !== id));
    toast('Case deleted');
  };

  const getStatusIcon = (status: Case['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'closed':
        return <XCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: Case['status']) => {
    const styles = {
      active: 'bg-green-100 text-green-800 border-green-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      closed: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return <Badge variant="outline" className={styles[status]}>{status.toUpperCase()}</Badge>;
  };

  const filteredCases = cases.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.caseType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const upcomingHearings = cases
    .filter(c => new Date(c.nextHearing) >= new Date())
    .sort((a, b) => new Date(a.nextHearing).getTime() - new Date(b.nextHearing).getTime())
    .slice(0, 5);

  return (
    <DashboardLayout
      userRole={userRole}
      currentPage="cases"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-[#1E293B] mb-2">Case Management</h1>
            <p className="text-gray-600">Track and manage all your legal cases</p>
          </div>
          <Button 
            onClick={() => setShowAddDialog(true)}
            className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add New Case
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Cases</CardDescription>
              <CardTitle className="text-[#1E3A8A]">{cases.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Cases</CardDescription>
              <CardTitle className="text-green-600">{cases.filter(c => c.status === 'active').length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-yellow-600">{cases.filter(c => c.status === 'pending').length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Closed</CardDescription>
              <CardTitle className="text-gray-600">{cases.filter(c => c.status === 'closed').length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Cases List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-[#1E293B]">All Cases</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant={viewMode === 'table' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('table')}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'calendar' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('calendar')}
                    >
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  </div>
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
                {viewMode === 'table' ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Case Name</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Next Hearing</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCases.map((caseItem) => (
                          <TableRow key={caseItem.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-[#1E3A8A]" />
                                {caseItem.name}
                              </div>
                            </TableCell>
                            <TableCell>{caseItem.client}</TableCell>
                            <TableCell>{caseItem.caseType}</TableCell>
                            <TableCell>{getStatusBadge(caseItem.status)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm">
                                <CalendarIcon className="h-4 w-4 text-gray-400" />
                                {new Date(caseItem.nextHearing).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onClick={() => handleDeleteCase(caseItem.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredCases.map((caseItem) => (
                      <Card key={caseItem.id} className="border-l-4 border-l-[#1E3A8A]">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="h-4 w-4 text-[#1E3A8A]" />
                                <h4 className="text-[#1E293B]">{caseItem.name}</h4>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{caseItem.client} • {caseItem.caseType}</p>
                              <div className="flex items-center gap-4 text-sm">
                                {getStatusBadge(caseItem.status)}
                                <span className="text-gray-500 flex items-center gap-1">
                                  <CalendarIcon className="h-3 w-3" />
                                  {new Date(caseItem.nextHearing).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  onClick={() => handleDeleteCase(caseItem.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Calendar Widget */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E293B]">Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="rounded-md border"
                />
              </CardContent>
            </Card>

            {/* Upcoming Hearings */}
            <Card className="border-2 border-[#D4AF37]/20">
              <CardHeader>
                <CardTitle className="text-[#1E293B] flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-[#D4AF37]" />
                  Upcoming Hearings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingHearings.map((caseItem) => (
                  <div key={caseItem.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <CalendarIcon className="h-4 w-4 text-[#1E3A8A] mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{caseItem.name}</p>
                        <p className="text-xs text-gray-600">{caseItem.client}</p>
                        <p className="text-xs text-[#D4AF37] mt-1">
                          {new Date(caseItem.nextHearing).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Case Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Add New Case</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="caseName">Case Name *</Label>
              <Input
                id="caseName"
                placeholder="e.g., Smith v. Johnson"
                value={newCase.name}
                onChange={(e) => setNewCase({ ...newCase, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="client">Client Name *</Label>
              <Input
                id="client"
                placeholder="e.g., John Smith"
                value={newCase.client}
                onChange={(e) => setNewCase({ ...newCase, client: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="caseType">Case Type *</Label>
              <Select value={newCase.caseType} onValueChange={(value) => setNewCase({ ...newCase, caseType: value })}>
                <SelectTrigger id="caseType">
                  <SelectValue placeholder="Select case type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Employment Law">Employment Law</SelectItem>
                  <SelectItem value="Civil Rights">Civil Rights</SelectItem>
                  <SelectItem value="Property Law">Property Law</SelectItem>
                  <SelectItem value="Estate Planning">Estate Planning</SelectItem>
                  <SelectItem value="Criminal Defense">Criminal Defense</SelectItem>
                  <SelectItem value="Family Law">Family Law</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="nextHearing">Next Hearing Date</Label>
              <Input
                id="nextHearing"
                type="date"
                value={newCase.nextHearing}
                onChange={(e) => setNewCase({ ...newCase, nextHearing: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddCase}
              className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
            >
              Add Case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
