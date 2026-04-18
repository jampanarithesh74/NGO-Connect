import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Upload, 
  History, 
  Clock, 
  CheckCircle2, 
  LogOut, 
  Send,
  AlertCircle,
  BarChart3,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type Section = 'home' | 'upload' | 'previous' | 'progress' | 'completed';

interface AnalysisResult {
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  urgency: 'Immediate' | 'Soon' | 'Planned';
}

export default function NGODashboard() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>('home');
  const [reportText, setReportText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);

  const handleAnalyze = async () => {
    if (!reportText.trim()) {
      toast.error("Please enter some report data to analyze.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const prompt = `
        Analyze the following NGO report and extract key action items or tasks. 
        For each task, provide:
        1. A concise title.
        2. A brief description.
        3. Priority (High, Medium, or Low).
        4. Urgency (Immediate, Soon, or Planned).
        
        Format the output as a JSON array of objects with keys: title, description, priority, urgency.
        
        Report:
        ${reportText}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      const text = response.text || "";
      
      // Clean up the response to ensure it's valid JSON
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        const parsedResults = JSON.parse(jsonMatch[0]);
        setAnalysisResults(parsedResults);
        
        // Save to Firestore
        await addDoc(collection(db, 'reports'), {
          ngoId: user?.uid,
          content: reportText,
          analysis: parsedResults,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        
        toast.success("Analysis complete and saved!");
      } else {
        throw new Error("Could not parse AI response");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("Failed to analyze report. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sidebarItems = [
    { id: 'upload', label: 'Upload Data', icon: Upload },
    { id: 'previous', label: 'Previous Uploads', icon: History },
    { id: 'progress', label: 'In Progress Works', icon: Clock },
    { id: 'completed', label: 'Completed Tasks', icon: CheckCircle2 },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary mb-8">
            <LayoutDashboard className="w-8 h-8" />
            <span className="font-bold text-xl tracking-tight">NGO Portal</span>
          </div>
          
          <nav className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as Section)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeSection === item.id 
                    ? 'bg-primary text-primary-foreground shadow-md' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.email}</p>
              <p className="text-xs text-slate-500">NGO Partner</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => signOut(auth)}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <AnimatePresence mode="wait">
          {activeSection === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto text-center mt-20"
            >
              <h1 className="text-5xl font-extrabold text-slate-900 mb-6">
                Welcome to your <span className="text-primary">NGO Dashboard</span>
              </h1>
              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Empowering your mission with AI-driven insights. Upload your reports, 
                track progress, and manage tasks efficiently to maximize your social impact.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <BarChart3 className="w-8 h-8 text-primary mb-2" />
                    <CardTitle className="text-lg">Smart Analysis</CardTitle>
                    <CardDescription>AI-powered report breakdown</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <Clock className="w-8 h-8 text-blue-500 mb-2" />
                    <CardTitle className="text-lg">Real-time Tracking</CardTitle>
                    <CardDescription>Monitor ongoing projects</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
                    <CardTitle className="text-lg">Impact Reports</CardTitle>
                    <CardDescription>Visualize your achievements</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </motion.div>
          )}

          {activeSection === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900">Upload & Analyze Data</h2>
                <p className="text-slate-500">Submit your NGO report for AI-powered priority analysis.</p>
              </div>

              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>NGO Report Input</CardTitle>
                  <CardDescription>
                    Paste your field reports, meeting notes, or project updates below.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="report">Report Content</Label>
                    <textarea
                      id="report"
                      className="w-full min-h-[200px] p-4 rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="e.g., We visited the rural health center today. There is a critical shortage of clean water and basic medical supplies. Three volunteers are needed for next week's vaccination drive..."
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                    />
                  </div>
                  <Button 
                    className="w-full py-6 text-lg" 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Analyzing with AI...
                      </>
                    ) : (
                      <>
                        Analyse Data
                        <Send className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {analysisResults.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-primary" />
                      Analysis Results
                    </h3>
                    <span className="text-sm text-slate-500">Sorted by Priority & Urgency</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysisResults.map((result, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <Card className="h-full border-l-4 overflow-hidden" 
                          style={{ 
                            borderLeftColor: result.priority === 'High' ? '#ef4444' : result.priority === 'Medium' ? '#f59e0b' : '#10b981' 
                          }}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start mb-2">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                result.priority === 'High' ? 'bg-red-100 text-red-700' : 
                                result.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {result.priority} Priority
                              </span>
                              <span className="text-[10px] font-medium text-slate-400 uppercase">
                                {result.urgency}
                              </span>
                            </div>
                            <CardTitle className="text-lg">{result.title}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed">
                              {result.description}
                            </p>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {(activeSection === 'previous' || activeSection === 'progress' || activeSection === 'completed') && (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-[60vh] text-slate-400"
            >
              <div className="p-4 bg-slate-100 rounded-full mb-4">
                <LayoutDashboard className="w-12 h-12" />
              </div>
              <h3 className="text-xl font-medium">Section Under Construction</h3>
              <p>We'll be building the {activeSection.replace('_', ' ')} section next!</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
