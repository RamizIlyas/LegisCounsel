import { useState } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Search, Filter, FileText, Download, ExternalLink, TrendingUp, Scale, Calendar } from 'lucide-react';
import type { Page, UserRole } from '../App';

interface LawyerDashboardProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  onRoleSwitch: () => void;
}

interface CaseResult {
  id: string;
  title: string;
  citation: string;
  court: string;
  year: string;
  keyStatute: string;
  relevanceScore: number;
  summary: string;
  fullText: string;
  citedLaws: string[];
  aiAnalysis: string;
}

const mockResults: CaseResult[] = [
  {
    id: '1',
    title: 'State v. Johnson',
    citation: '456 F.3d 789 (9th Cir. 2023)',
    court: 'Court of Appeals, 9th Circuit',
    year: '2023',
    keyStatute: 'Criminal Procedure § 1234',
    relevanceScore: 98,
    summary: 'Landmark case establishing new precedent for digital evidence admissibility in criminal proceedings. The court held that proper chain of custody protocols must be maintained for electronic evidence.',
    fullText: 'The Court considered the admissibility of digital evidence obtained through cloud storage providers. The defendant challenged the admission of emails and documents stored on remote servers...',
    citedLaws: ['Federal Rules of Evidence 901', 'Criminal Procedure § 1234', '18 U.S.C. § 2701'],
    aiAnalysis: 'This case is highly relevant to your search query regarding digital evidence standards. The court\'s reasoning establishes a four-factor test for authenticating cloud-stored evidence, which has been adopted by multiple jurisdictions.'
  },
  {
    id: '2',
    title: 'Martinez v. Corporate Holdings Inc.',
    citation: '789 F.2d 234 (2nd Cir. 2024)',
    court: 'Court of Appeals, 2nd Circuit',
    year: '2024',
    keyStatute: 'Employment Law § 5678',
    relevanceScore: 95,
    summary: 'Important ruling on employment discrimination and the burden of proof in wrongful termination cases. Court clarified the McDonnell Douglas framework application.',
    fullText: 'The plaintiff alleged wrongful termination based on age discrimination. The court analyzed whether the employer\'s stated reasons for termination were pretextual...',
    citedLaws: ['Title VII Civil Rights Act', 'Employment Law § 5678', 'McDonnell Douglas Corp. v. Green'],
    aiAnalysis: 'This recent decision refines the evidentiary standards for employment discrimination claims. Note the court\'s emphasis on temporal proximity between protected activity and adverse action.'
  },
  {
    id: '3',
    title: 'People v. Thompson',
    citation: '123 S.E.2d 456 (Calif. 2023)',
    court: 'Supreme Court of California',
    year: '2023',
    keyStatute: 'Penal Code § 987',
    relevanceScore: 92,
    summary: 'Significant case on Fourth Amendment search and seizure in the context of vehicle searches. Established new standards for probable cause.',
    fullText: 'Officer conducted a warrantless search of defendant\'s vehicle following a traffic stop. The court examined whether exigent circumstances justified the search...',
    citedLaws: ['Fourth Amendment', 'Penal Code § 987', 'Terry v. Ohio'],
    aiAnalysis: 'This case provides crucial guidance on warrantless vehicle searches. The court\'s three-part analysis should be applied when evaluating similar fact patterns.'
  }
];

export function LawyerDashboard({ onNavigate, onLogout, onRoleSwitch }: LawyerDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCase, setSelectedCase] = useState<CaseResult | null>(null);
  const [yearFilter, setYearFilter] = useState('all');
  const [jurisdictionFilter, setJurisdictionFilter] = useState('all');
  const [relevanceFilter, setRelevanceFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const searchBar = (
    <div className="flex-1 max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search for legal arguments, precedents, or statutes..."
          className="pl-10 bg-gray-50 border-gray-200"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <DashboardLayout
      userRole="lawyer"
      currentPage="dashboard"
      onNavigate={onNavigate}
      onLogout={onLogout}
      onRoleSwitch={onRoleSwitch}
      searchBar={searchBar}
    >
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-[#1E293B] mb-2">Welcome back, John</h1>
            <p className="text-gray-600">Find the perfect legal precedent with AI-powered search</p>
          </div>
          <Badge className="bg-[#1E3A8A] text-white">Lawyer View</Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Recent Searches</CardDescription>
              <CardTitle className="text-[#1E3A8A]">247</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">+12% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Saved Cases</CardDescription>
              <CardTitle className="text-[#D4AF37]">89</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">23 added this week</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Clients</CardDescription>
              <CardTitle className="text-[#1E3A8A]">34</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">5 new this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg. Relevance</CardDescription>
              <CardTitle className="text-[#D4AF37]">94%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">High accuracy rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-[#1E293B]">AI Legal Search</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                Filters
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="text-sm text-gray-600 mb-2 block">Year</label>
                  <Select value={yearFilter} onValueChange={setYearFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2023">2023</SelectItem>
                      <SelectItem value="2022">2022</SelectItem>
                      <SelectItem value="2021">2021</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-2 block">Jurisdiction</label>
                  <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Jurisdictions</SelectItem>
                      <SelectItem value="federal">Federal</SelectItem>
                      <SelectItem value="state">State Courts</SelectItem>
                      <SelectItem value="9th">9th Circuit</SelectItem>
                      <SelectItem value="2nd">2nd Circuit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-2 block">Relevance</label>
                  <Select value={relevanceFilter} onValueChange={setRelevanceFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Results</SelectItem>
                      <SelectItem value="high">High (90%+)</SelectItem>
                      <SelectItem value="medium">Medium (70-90%)</SelectItem>
                      <SelectItem value="low">Low (&lt;70%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {mockResults.map((result) => (
                <Card key={result.id} className="border-l-4 border-l-[#1E3A8A] hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-[#1E293B] mb-2">{result.title}</CardTitle>
                        <CardDescription className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Scale className="h-4 w-4" />
                            <span>{result.citation}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4" />
                            <span>{result.court} • {result.year}</span>
                          </div>
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {result.relevanceScore}% Relevant
                        </Badge>
                        <Badge variant="outline" className="border-[#D4AF37] text-[#D4AF37]">
                          AI Generated
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm text-[#1E293B] mb-1"><strong>Key Statute:</strong> {result.keyStatute}</p>
                      <p className="text-sm text-gray-600">{result.summary}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setSelectedCase(result)}
                        className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        View Details
                      </Button>
                      <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                      <Button variant="outline">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Source
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Case Detail Modal */}
      <Dialog open={!!selectedCase} onOpenChange={() => setSelectedCase(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] pr-8">{selectedCase?.title}</DialogTitle>
            <p className="text-sm text-gray-600">{selectedCase?.citation}</p>
          </DialogHeader>
          
          <Tabs defaultValue="judgment" className="mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="judgment">Judgment Text</TabsTrigger>
              <TabsTrigger value="laws">Cited Laws</TabsTrigger>
              <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
              <TabsTrigger value="download">Download</TabsTrigger>
            </TabsList>
            
            <TabsContent value="judgment" className="space-y-4 mt-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-[#1E293B] mb-2">Summary</h4>
                <p className="text-sm text-gray-700">{selectedCase?.summary}</p>
              </div>
              <div>
                <h4 className="text-[#1E293B] mb-2">Full Text</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedCase?.fullText}</p>
              </div>
            </TabsContent>
            
            <TabsContent value="laws" className="space-y-2 mt-4">
              <h4 className="text-[#1E293B] mb-3">Referenced Statutes and Cases</h4>
              {selectedCase?.citedLaws.map((law, idx) => (
                <Card key={idx} className="border-l-4 border-l-[#D4AF37]">
                  <CardContent className="p-4">
                    <p className="text-sm">{law}</p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
            
            <TabsContent value="analysis" className="mt-4">
              <Card className="border-2 border-[#1E3A8A]/20 bg-[#1E3A8A]/5">
                <CardHeader>
                  <CardTitle className="text-[#1E293B] flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-[#D4AF37]" />
                    AI-Powered Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700">{selectedCase?.aiAnalysis}</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="download" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Button className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download DOCX
                </Button>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download TXT
                </Button>
                <Button variant="outline">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Original
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
