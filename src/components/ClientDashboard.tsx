// import { useState } from 'react';
// import { DashboardLayout } from './DashboardLayout';
// import { Button } from './ui/button';
// import { Input } from './ui/input';
// import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
// import { Badge } from './ui/badge';
// import { Avatar, AvatarFallback } from './ui/avatar';
// import { ScrollArea } from './ui/scroll-area';
// import { Send, Bot, User, FileText, Scale, MessageCircle, Sparkles } from 'lucide-react';
// import type { Page } from '../App';

// interface ClientDashboardProps {
//   onNavigate: (page: Page) => void;
//   onLogout: () => void;
//   onRoleSwitch: () => void;
// }

// interface Message {
//   id: string;
//   role: 'user' | 'assistant';
//   content: string;
//   references?: { title: string; citation: string }[];
// }

// const initialMessages: Message[] = [
//   {
//     id: '1',
//     role: 'assistant',
//     content: 'Hello! I\'m your AI legal assistant. You can ask me questions about legal matters in simple language, and I\'ll help you understand the relevant laws and precedents. How can I help you today?'
//   }
// ];

// const quickQuestions = [
//   'What are my rights as a tenant?',
//   'How does small claims court work?',
//   'What is breach of contract?',
//   'Explain employment discrimination laws'
// ];

// export function ClientDashboard({ onNavigate, onLogout, onRoleSwitch }: ClientDashboardProps) {
//   const [messages, setMessages] = useState<Message[]>(initialMessages);
//   const [inputValue, setInputValue] = useState('');
//   const [isTyping, setIsTyping] = useState(false);

//   const handleSendMessage = (messageText?: string) => {
//     const text = messageText || inputValue;
//     if (!text.trim()) return;

//     const userMessage: Message = {
//       id: Date.now().toString(),
//       role: 'user',
//       content: text
//     };

//     setMessages(prev => [...prev, userMessage]);
//     setInputValue('');
//     setIsTyping(true);

//     // Simulate AI response
//     setTimeout(() => {
//       const aiMessage: Message = {
//         id: (Date.now() + 1).toString(),
//         role: 'assistant',
//         content: generateAIResponse(text),
//         references: [
//           {
//             title: 'Smith v. Landlord Properties',
//             citation: '234 F.2d 567 (2023)'
//           },
//           {
//             title: 'Tenant Rights Act § 123',
//             citation: 'State Code § 123.45'
//           }
//         ]
//       };
//       setMessages(prev => [...prev, aiMessage]);
//       setIsTyping(false);
//     }, 1500);
//   };

//   const generateAIResponse = (question: string): string => {
//     if (question.toLowerCase().includes('tenant') || question.toLowerCase().includes('rent')) {
//       return 'As a tenant, you have several important rights:\n\n1. **Right to Habitable Housing**: Your landlord must maintain the property in a safe and livable condition.\n\n2. **Right to Privacy**: Your landlord must provide proper notice (usually 24-48 hours) before entering your rental unit.\n\n3. **Right to Fair Treatment**: You\'re protected against discrimination based on race, religion, national origin, disability, or family status.\n\n4. **Security Deposit Rights**: Your landlord must return your security deposit (minus legitimate deductions) within a specific timeframe after you move out.\n\n5. **Right to Withhold Rent**: In some cases, if your landlord fails to make necessary repairs, you may have the right to withhold rent or make repairs and deduct the cost.\n\nThese rights vary by state, so I recommend consulting with a local attorney for specific guidance about your situation.';
//     }
//     return 'I understand your question. Based on current legal standards, here\'s what you need to know:\n\nThe law in this area has been established through several important court decisions and statutes. Generally speaking, you have certain rights and responsibilities that are protected under law.\n\nI\'ve found some relevant cases and legal references that might help. Would you like me to connect you with a qualified attorney who can provide more specific advice for your situation?';
//   };

//   return (
//     <DashboardLayout
//       userRole="client"
//       currentPage="dashboard"
//       onNavigate={onNavigate}
//       onLogout={onLogout}
//       onRoleSwitch={onRoleSwitch}
//     >
//       <div className="grid lg:grid-cols-3 gap-6">
//         {/* Main Chat Area */}
//         <div className="lg:col-span-2">
//           <Card className="h-[calc(100vh-12rem)] overflow-y-auto">
//             <CardHeader className="border-b bg-gradient-to-r from-[#1E3A8A] to-[#1E3A8A]/80">
//               <div className="flex items-center gap-3">
//                 <div className="w-10 h-10 rounded-full bg-[#D4AF37] flex items-center justify-center">
//                   <Bot className="h-6 w-6 text-white" />
//                 </div>
//                 <div className="flex-1">
//                   <CardTitle className="text-white">AI Legal Assistant</CardTitle>
//                   <p className="text-sm text-white/80">Ask your legal questions in simple language</p>
//                 </div>
//                 <Badge className="bg-white/20 text-white border-white/30">Client View</Badge>
//               </div>
//             </CardHeader>
            
//             <CardContent className="p-0 flex flex-col h-[calc(100%-5rem)]">
//               <ScrollArea className="flex-1 p-6">
//                 <div className="space-y-4">
//                   {messages.map((message) => (
//                     <div
//                       key={message.id}
//                       className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
//                     >
//                       {message.role === 'assistant' && (
//                         <Avatar className="h-8 w-8 flex-shrink-0">
//                           <AvatarFallback className="bg-[#1E3A8A] text-white">
//                             <Bot className="h-4 w-4" />
//                           </AvatarFallback>
//                         </Avatar>
//                       )}
                      
//                       <div className={`max-w-[80%] ${message.role === 'user' ? 'order-1' : ''}`}>
//                         <div
//                           className={`rounded-lg p-4 ${
//                             message.role === 'user'
//                               ? 'bg-[#1E3A8A] text-white'
//                               : 'bg-gray-100 text-gray-800'
//                           }`}
//                         >
//                           <p className="text-sm whitespace-pre-wrap">{message.content}</p>
//                         </div>
                        
//                         {message.references && (
//                           <div className="mt-2 space-y-2">
//                             <p className="text-xs text-gray-500 flex items-center gap-1">
//                               <FileText className="h-3 w-3" />
//                               Legal References:
//                             </p>
//                             {message.references.map((ref, idx) => (
//                               <Card key={idx} className="border-l-4 border-l-[#D4AF37]">
//                                 <CardContent className="p-3">
//                                   <p className="text-sm">{ref.title}</p>
//                                   <p className="text-xs text-gray-500">{ref.citation}</p>
//                                 </CardContent>
//                               </Card>
//                             ))}
//                           </div>
//                         )}
//                       </div>
                      
//                       {message.role === 'user' && (
//                         <Avatar className="h-8 w-8 flex-shrink-0">
//                           <AvatarFallback className="bg-[#D4AF37] text-white">
//                             <User className="h-4 w-4" />
//                           </AvatarFallback>
//                         </Avatar>
//                       )}
//                     </div>
//                   ))}
                  
//                   {isTyping && (
//                     <div className="flex gap-3">
//                       <Avatar className="h-8 w-8 flex-shrink-0">
//                         <AvatarFallback className="bg-[#1E3A8A] text-white">
//                           <Bot className="h-4 w-4" />
//                         </AvatarFallback>
//                       </Avatar>
//                       <div className="bg-gray-100 rounded-lg p-4">
//                         <div className="flex gap-1">
//                           <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
//                           <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
//                           <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
//                         </div>
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               </ScrollArea>
              
//               <div className="p-4 border-t bg-white">
//                 <div className="flex gap-2">
//                   <Input
//                     placeholder="Ask your legal question in simple language..."
//                     value={inputValue}
//                     onChange={(e) => setInputValue(e.target.value)}
//                     onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
//                     className="flex-1"
//                   />
//                   <Button 
//                     onClick={() => handleSendMessage()}
//                     className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
//                   >
//                     <Send className="h-4 w-4" />
//                   </Button>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>
//         </div>

//         {/* Sidebar */}
//         <div className="space-y-6">
//           {/* Quick Questions */}
//           <Card>
//             <CardHeader>
//               <CardTitle className="text-[#1E293B] flex items-center gap-2">
//                 <Sparkles className="h-5 w-5 text-[#D4AF37]" />
//                 Quick Questions
//               </CardTitle>
//             </CardHeader>
//             <CardContent className="space-y-2">
//               {quickQuestions.map((question, idx) => (
//                 <Button
//                   key={idx}
//                   variant="outline"
//                   className="w-full justify-start text-left h-auto py-3 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
//                   onClick={() => handleSendMessage(question)}
//                 >
//                   <MessageCircle className="h-4 w-4 mr-2 flex-shrink-0" />
//                   <span className="text-sm text-wrap">{question}</span>
//                 </Button>
//               ))}
//             </CardContent>
//           </Card>

//           {/* Help Card */}
//           <Card className="border-2 border-[#D4AF37]/20 bg-[#D4AF37]/5">
//             <CardHeader>
//               <CardTitle className="text-[#1E293B]">Need a Lawyer?</CardTitle>
//             </CardHeader>
//             <CardContent className="space-y-4">
//               <p className="text-sm text-gray-600">
//                 While I can provide general legal information, consulting with a qualified attorney is recommended for specific legal advice.
//               </p>
//               <Button 
//                 className="w-full bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white"
//                 onClick={() => onNavigate('communication')}
//               >
//                 <Scale className="mr-2 h-4 w-4" />
//                 Connect with a Lawyer
//               </Button>
//             </CardContent>
//           </Card>

//           {/* Info Card */}
//           <Card>
//             <CardHeader>
//               <CardTitle className="text-[#1E293B]">How This Works</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <ul className="space-y-2 text-sm text-gray-600">
//                 <li className="flex gap-2">
//                   <span className="text-[#1E3A8A]">•</span>
//                   <span>Ask questions in plain English</span>
//                 </li>
//                 <li className="flex gap-2">
//                   <span className="text-[#1E3A8A]">•</span>
//                   <span>Get simplified explanations</span>
//                 </li>
//                 <li className="flex gap-2">
//                   <span className="text-[#1E3A8A]">•</span>
//                   <span>See relevant case references</span>
//                 </li>
//                 <li className="flex gap-2">
//                   <span className="text-[#1E3A8A]">•</span>
//                   <span>Connect with lawyers when needed</span>
//                 </li>
//               </ul>
//               <Button
//                 variant="link"
//                 className="text-[#1E3A8A] p-0 mt-4"
//                 onClick={onRoleSwitch}
//               >
//                 Switch to detailed lawyer view →
//               </Button>
//             </CardContent>
//           </Card>
//         </div>
//       </div>
//     </DashboardLayout>
//   );
// }



// ClientDashboard.tsx
import { AiChatInterface } from './AiChatInterface';
import { DashboardLayout } from './DashboardLayout';
import type { Page } from '../App';

interface ClientDashboardProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  onRoleSwitch: () => void;
}

export function ClientDashboard({ onNavigate, onLogout, onRoleSwitch }: ClientDashboardProps) {
  return (
    <DashboardLayout
      userRole="Client"
      currentPage="dashboard"
      onNavigate={onNavigate}
      onLogout={onLogout}
      onRoleSwitch={onRoleSwitch}
    >
      <AiChatInterface
        onConnectWithLawyer={() => onNavigate('communication')}
        onRoleSwitch={onRoleSwitch}
      />
    </DashboardLayout>
  );
}