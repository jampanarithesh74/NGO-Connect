import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, X, Bot, User, Minimize2, Maximize2, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getChatIntelligence, ChatMessage } from '../services/chatIntelligence';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ChatBotProps {
  tasks?: any[];
  userRole?: 'ngo' | 'volunteer';
  currentTask?: any;
}

export const ChatBot: React.FC<ChatBotProps> = ({ tasks, userRole, currentTask }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: `Mission Intelligence online. How can I assist your efforts today, ${userRole === 'ngo' ? 'Director' : 'Hero'}?` }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const response = await getChatIntelligence(
        [...messages, { role: 'user', text: userMessage }],
        { tasks, userRole, currentTask }
      );
      setMessages(prev => [...prev, { role: 'model', text: response || "No response recorded." }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: "Signal lost. Mission Control unreachable." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 w-[350px] sm:w-[400px] h-[500px] shadow-2xl flex flex-col pointer-events-auto"
          >
            <Card className="flex-1 flex flex-col border-2 border-slate-800 bg-slate-900 overflow-hidden shadow-[0_0_40px_rgba(30,41,59,0.3)]">
              {/* Header */}
              <div className="p-4 bg-slate-800 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Mission Intelligence</h4>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] text-emerald-500 font-bold uppercase">Online</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-white"
                    onClick={() => setIsMinimized(true)}
                  >
                    <Minimize2 className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-white"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Context Bar */}
              {currentTask && (
                <div className="px-4 py-1.5 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-blue-400 font-bold uppercase truncate">
                    Context: {currentTask.title}
                  </span>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
                {messages.map((m, i) => (
                  <div 
                    key={i} 
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        m.role === 'user' ? 'bg-slate-700 text-slate-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {m.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>
                      <div className={`p-3 rounded-2xl text-sm leading-relaxed markdown-container ${
                        m.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-tr-none shadow-lg' 
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
                      }`}>
                        <ReactMarkdown 
                          components={{
                            p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({children}) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                            ol: ({children}) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                            li: ({children}) => <li className="mb-1">{children}</li>,
                            strong: ({children}) => <strong className="font-bold text-blue-400">{children}</strong>
                          }}
                        >
                          {m.text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-2 flex-row">
                      <div className="mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                      </div>
                      <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-slate-700">
                        <div className="flex gap-1 justify-center py-1">
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-blue-400 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-blue-400 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-blue-400 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 bg-slate-800 border-t border-slate-700">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="flex gap-2"
                >
                  <Input 
                    placeholder="Type your request..." 
                    className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={isLoading}
                  />
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="bg-blue-600 hover:bg-blue-700 h-10 w-10 shrink-0"
                    disabled={isLoading || !inputValue.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3">
        {isMinimized && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setIsMinimized(false)}
            className="bg-slate-900 border-2 border-slate-800 p-2 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <Maximize2 className="w-5 h-5" />
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (isMinimized) setIsMinimized(false);
            else setIsOpen(!isOpen);
          }}
          className={`h-14 w-14 rounded-full flex items-center justify-center shadow-2xl relative transition-colors duration-300 ${
            isOpen ? 'bg-slate-900 border-2 border-slate-800' : 'bg-primary'
          }`}
        >
          {isOpen ? (
            <X className={`w-6 h-6 text-white`} />
          ) : (
            <>
              <MessageSquare className="w-6 h-6 text-white" />
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center animate-bounce">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </div>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};
