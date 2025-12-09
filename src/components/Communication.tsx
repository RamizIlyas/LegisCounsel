import { useState } from "react";
import { DashboardLayout } from "./DashboardLayout";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import {
  Send,
  Paperclip,
  Search,
  MoreVertical,
  Phone,
  Video,
  User,
  Circle,
} from "lucide-react";
import type { Page, UserRole } from "../App";

interface CommunicationProps {
  userRole: UserRole;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

interface Contact {
  id: string;
  name: string;
  role: "lawyer" | "client";
  lastMessage: string;
  timestamp: string;
  unread: number;
  online: boolean;
  avatar: string;
}

interface Message {
  id: string;
  sender: "me" | "them";
  content: string;
  timestamp: string;
  attachment?: { name: string; type: string };
}

const mockContacts: Contact[] = [
  {
    id: "1",
    name: "Sarah Johnson",
    role: "client",
    lastMessage: "Thank you for the update on my case.",
    timestamp: "10:30 AM",
    unread: 2,
    online: true,
    avatar: "SJ",
  },
  {
    id: "2",
    name: "Michael Chen",
    role: "lawyer",
    lastMessage: "I reviewed the documents you sent.",
    timestamp: "Yesterday",
    unread: 0,
    online: true,
    avatar: "MC",
  },
  {
    id: "3",
    name: "Emily Rodriguez",
    role: "client",
    lastMessage: "When is our next hearing?",
    timestamp: "Monday",
    unread: 0,
    online: false,
    avatar: "ER",
  },
  {
    id: "4",
    name: "David Thompson",
    role: "client",
    lastMessage: "The contract looks good.",
    timestamp: "Last week",
    unread: 1,
    online: false,
    avatar: "DT",
  },
];

const mockMessages: Message[] = [
  {
    id: "1",
    sender: "them",
    content:
      "Hello, I wanted to discuss the latest updates on my employment case.",
    timestamp: "10:15 AM",
  },
  {
    id: "2",
    sender: "me",
    content:
      "Of course! I have good news. We received a favorable response from the opposing counsel.",
    timestamp: "10:18 AM",
  },
  {
    id: "3",
    sender: "them",
    content: "That's wonderful! What are the next steps?",
    timestamp: "10:20 AM",
  },
  {
    id: "4",
    sender: "me",
    content:
      "I've prepared a detailed summary of the settlement offer. Let me send you the document.",
    timestamp: "10:25 AM",
    attachment: { name: "Settlement_Summary.pdf", type: "pdf" },
  },
  {
    id: "5",
    sender: "them",
    content:
      "Thank you for the update on my case. I'll review the document and get back to you.",
    timestamp: "10:30 AM",
  },
];

export function Communication({
  userRole,
  onNavigate,
  onLogout,
}: CommunicationProps) {
  const [selectedContact, setSelectedContact] = useState<Contact>(
    mockContacts[0]
  );
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: "me",
      content: inputValue,
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
    };

    setMessages([...messages, newMessage]);
    setInputValue("");
  };

  const filteredContacts = mockContacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout
      userRole={userRole}
      currentPage="communication"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <Card className=" h-[calc(100vh-14rem)] overflow-y-auto">
        <div className="grid md:grid-cols-[350px,1fr] h-full">
          {/* Contacts Sidebar */}
          <div className="border-r">
            
            <div className="flex gap-2">
              <div>
              <CardHeader className="border-b">
              <CardTitle className="text-[#1E293B]">Messages</CardTitle>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search contacts..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
              <ScrollArea className="h-[calc(100%-9rem)]">
                <div className="p-2">
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContact(contact)}
                      className={`w-full p-3 rounded-lg flex items-center gap-3 mb-1 transition-colors ${
                        selectedContact.id === contact.id
                          ? "bg-[#1E3A8A]/10 border border-[#1E3A8A]/20"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <div className="relative">
                        <Avatar>
                          <AvatarFallback
                            className={`${
                              contact.role === "lawyer"
                                ? "bg-[#1E3A8A]"
                                : "bg-[#D4AF37]"
                            } text-white`}
                          >
                            {contact.avatar}
                          </AvatarFallback>
                        </Avatar>
                        {contact.online && (
                          <Circle className="absolute bottom-0 right-0 h-3 w-3 fill-green-500 text-green-500 border-2 border-white rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="text-sm truncate">{contact.name}</h4>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                            {contact.timestamp}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 truncate">
                          {contact.lastMessage}
                        </p>
                      </div>
                      {contact.unread > 0 && (
                        <Badge className="bg-[#D4AF37] text-white text-xs">
                          {contact.unread}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              </div>

              <Card className="flex-1 border-l">
                {/* Chat Area */}
                <div className="flex flex-col">
                  {/* Chat Header */}
                  <div className="border-b p-4 bg-white">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar>
                            <AvatarFallback
                              className={`${
                                selectedContact.role === "lawyer"
                                  ? "bg-[#1E3A8A]"
                                  : "bg-[#D4AF37]"
                              } text-white`}
                            >
                              {selectedContact.avatar}
                            </AvatarFallback>
                          </Avatar>
                          {selectedContact.online && (
                            <Circle className="absolute bottom-0 right-0 h-3 w-3 fill-green-500 text-green-500 border-2 border-white rounded-full" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-[#1E293B]">
                            {selectedContact.name}
                          </h3>
                          <p className="text-xs text-gray-500 capitalize">
                            {selectedContact.online ? "Active now" : "Offline"}{" "}
                            • {selectedContact.role}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon">
                          <Phone className="h-5 w-5 text-gray-600" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Video className="h-5 w-5 text-gray-600" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-5 w-5 text-gray-600" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-6 bg-gray-50">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${
                            message.sender === "me"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          {message.sender === "them" && (
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarFallback
                                className={`${
                                  selectedContact.role === "lawyer"
                                    ? "bg-[#1E3A8A]"
                                    : "bg-[#D4AF37]"
                                } text-white`}
                              >
                                {selectedContact.avatar}
                              </AvatarFallback>
                            </Avatar>
                          )}

                          <div
                            className={`max-w-[70%] ${
                              message.sender === "me" ? "order-1" : ""
                            }`}
                          >
                            <div
                              className={`rounded-lg p-4 ${
                                message.sender === "me"
                                  ? "bg-[#1E3A8A] text-white"
                                  : "bg-white text-gray-800 border"
                              }`}
                            >
                              <p className="text-sm">{message.content}</p>
                              {message.attachment && (
                                <div
                                  className={`mt-2 p-2 rounded border ${
                                    message.sender === "me"
                                      ? "bg-white/10 border-white/20"
                                      : "bg-gray-50 border-gray-200"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Paperclip className="h-4 w-4" />
                                    <span className="text-sm">
                                      {message.attachment.name}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <p
                              className={`text-xs text-gray-500 mt-1 ${
                                message.sender === "me"
                                  ? "text-right"
                                  : "text-left"
                              }`}
                            >
                              {message.timestamp}
                            </p>
                          </div>

                          {message.sender === "me" && (
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarFallback className="bg-[#D4AF37] text-white">
                                <User className="h-4 w-4" />
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Message Input */}
                  <div className="p-4 bg-white border-t">
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon">
                        <Paperclip className="h-5 w-5 text-gray-600" />
                      </Button>
                      <Input
                        placeholder="Type your message..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={(e) =>
                          e.key === "Enter" && handleSendMessage()
                        }
                        className="flex-1"
                      />
                      <Button
                        onClick={handleSendMessage}
                        className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      All communications are encrypted and confidential
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Card>
    </DashboardLayout>
  );
}
