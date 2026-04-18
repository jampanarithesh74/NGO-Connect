import React, { useState, useEffect } from 'react';
import { useAuth } from '@/src/lib/AuthContext';
import { auth, db } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/src/lib/firestoreUtils';
import { 
  LayoutDashboard, 
  Search, 
  Zap, 
  BookmarkCheck, 
  Clock, 
  Trophy, 
  LogOut, 
  Heart,
  MapPin,
  Calendar,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Stethoscope,
  Utensils,
  BookOpen,
  Truck,
  Wrench,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type Section = 'home' | 'find' | 'matched' | 'accepted' | 'progress' | 'contributions';

interface Task {
  id: string;
  reportId: string;
  ngoId: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  urgency: 'Immediate' | 'Soon' | 'Planned';
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: Timestamp;
}

const PREDEFINED_SKILLS = [
  { id: 'medical', label: 'Medical Support', icon: Stethoscope },
  { id: 'food', label: 'Food Supply', icon: Utensils },
  { id: 'education', label: 'Education/Teaching', icon: BookOpen },
  { id: 'logistics', label: 'Logistics/Transport', icon: Truck },
  { id: 'technical', label: 'Technical/Repair', icon: Wrench },
  { id: 'social', label: 'Social Work', icon: Users },
];

export default function VolunteerDashboard() {
  const { user, userSkills } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>('home');
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [matchedTasks, setMatchedTasks] = useState<Task[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState('');
  const [isSavingSkills, setIsSavingSkills] = useState(false);

  // Fetch all tasks from NGO reports
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasks: Task[] = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.analysis && Array.isArray(data.analysis)) {
          data.analysis.forEach((item: any, index: number) => {
            tasks.push({
              id: `${doc.id}-${index}`,
              reportId: doc.id,
              ngoId: data.ngoId,
              title: item.title,
              description: item.description,
              priority: item.priority,
              urgency: item.urgency,
              status: data.status || 'pending',
              createdAt: data.createdAt
            });
          });
        }
      });
      setAllTasks(tasks);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    return () => unsubscribe();
  }, []);

  const handleSaveSkills = async () => {
    if (selectedSkills.length === 0 && !customSkill.trim()) {
      toast.error("Please select or enter at least one skill.");
      return;
    }

    setIsSavingSkills(true);
    try {
      const finalSkills = [...selectedSkills];
      if (customSkill.trim()) finalSkills.push(customSkill.trim());

      await updateDoc(doc(db, 'users', user!.uid), {
        skills: finalSkills,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user?.uid}`);
    } finally {
      setIsSavingSkills(false);
    }
  };

  const handleMatchTasks = async () => {
    if (!userSkills || userSkills.length === 0) {
      toast.error("Please set your skills first.");
      return;
    }

    setIsMatching(true);
    setActiveSection('matched');
    
    try {
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `
          Match the following volunteer skills with the list of available tasks.
          Volunteer Skills: ${userSkills.join(', ')}
          
          Available Tasks:
          ${allTasks.map(t => `- [ID: ${t.id}] ${t.title}: ${t.description}`).join('\n')}
          
          Return a JSON array of task IDs that are a good match for the volunteer's skills.
          Only return the array of IDs.
        `,
      });
      
      const response = await model;
      const text = response.text || "";
      const jsonMatch = text.match(/\[.*\]/s);
      
      if (jsonMatch) {
        const matchedIds = JSON.parse(jsonMatch[0]);
        const matched = allTasks.filter(t => matchedIds.includes(t.id));
        setMatchedTasks(matched);
        toast.success(`Found ${matched.length} matched tasks!`);
      }
    } catch (error) {
      console.error("Matching error:", error);
      toast.error("Failed to match tasks. Showing all tasks instead.");
      setMatchedTasks(allTasks);
    } finally {
      setIsMatching(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  // If volunteer hasn't set skills yet, show skill selection
  if (userSkills && userSkills.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full"
        >
          <Card className="shadow-xl border-t-4 border-t-primary">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-3xl">What are your skills?</CardTitle>
              <CardDescription>
                Tell us what you're good at so we can match you with the right NGO needs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {PREDEFINED_SKILLS.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => toggleSkill(skill.label)}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 text-center ${
                      selectedSkills.includes(skill.label)
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-slate-100 hover:border-slate-200 text-slate-600'
                    }`}
                  >
                    <skill.icon className="w-6 h-6" />
                    <span className="text-sm font-medium">{skill.label}</span>
                  </button>
                ))}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="custom-skill">Other Skills</Label>
                <Input 
                  id="custom-skill" 
                  placeholder="e.g., Graphic Design, Counseling, etc." 
                  value={customSkill}
                  onChange={(e) => setCustomSkill(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full py-6 text-lg" 
                onClick={handleSaveSkills}
                disabled={isSavingSkills}
              >
                {isSavingSkills ? "Saving..." : "Start Volunteering"}
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  const sidebarItems = [
    { id: 'find', label: 'Find Needs', icon: Search },
    { id: 'matched', label: 'Matched Tasks', icon: Zap },
    { id: 'accepted', label: 'Accepted Tasks', icon: BookmarkCheck },
    { id: 'progress', label: 'In Progress Tasks', icon: Clock },
    { id: 'contributions', label: 'Your Contributions', icon: Trophy },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary mb-8">
            <Heart className="w-8 h-8 fill-primary" />
            <span className="font-bold text-xl tracking-tight">Volunteer</span>
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
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.email}</p>
              <p className="text-xs text-slate-500">Volunteer</p>
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
                Volunteer <span className="text-primary">Dashboard</span>
              </h1>
              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Your skills are the key to making a difference. Browse needs from NGOs, 
                get matched with tasks that fit your expertise, and start contributing today.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mb-12">
                {userSkills?.map((skill, i) => (
                  <span key={i} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                    {skill}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <Search className="w-8 h-8 text-primary mb-2" />
                    <CardTitle className="text-lg">Find Needs</CardTitle>
                    <CardDescription>Browse all active NGO requests</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <Zap className="w-8 h-8 text-amber-500 mb-2" />
                    <CardTitle className="text-lg">AI Matching</CardTitle>
                    <CardDescription>Get tasks based on your skills</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <Trophy className="w-8 h-8 text-green-500 mb-2" />
                    <CardTitle className="text-lg">Track Impact</CardTitle>
                    <CardDescription>See your total contributions</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </motion.div>
          )}

          {activeSection === 'find' && (
            <motion.div
              key="find"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900">Find Needs</h2>
                <p className="text-slate-500">Explore all opportunities to help from our NGO partners.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {allTasks.map((task) => (
                  <Card key={task.id} className="border-l-4" 
                    style={{ 
                      borderLeftColor: task.priority === 'High' ? '#ef4444' : task.priority === 'Medium' ? '#f59e0b' : '#10b981' 
                    }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          task.priority === 'High' ? 'bg-red-100 text-red-700' : 
                          task.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {task.priority} Priority
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase">
                          {task.urgency}
                        </span>
                      </div>
                      <CardTitle className="text-lg">{task.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-600 line-clamp-3">
                        {task.description}
                      </p>
                    </CardContent>
                    <CardFooter className="pt-0">
                      <div className="flex items-center text-[10px] text-slate-400 gap-2">
                        <Calendar className="w-3 h-3" />
                        {task.createdAt?.toDate().toLocaleDateString()}
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>

              <div className="sticky bottom-8 flex justify-center">
                <Button 
                  size="lg" 
                  className="shadow-xl px-8 py-6 text-lg rounded-full"
                  onClick={handleMatchTasks}
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Match Tasks for Me
                </Button>
              </div>
            </motion.div>
          )}

          {activeSection === 'matched' && (
            <motion.div
              key="matched"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <Zap className="w-8 h-8 text-amber-500 fill-amber-500" />
                  Matched Tasks
                </h2>
                <p className="text-slate-500">AI-powered recommendations based on your unique skills.</p>
              </div>

              {isMatching ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <p className="text-slate-500 animate-pulse">Gemini is matching your skills with NGO needs...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {matchedTasks.length === 0 ? (
                    <div className="col-span-full py-20 text-center text-slate-400">
                      <p>No direct matches found. Try adding more skills to your profile!</p>
                    </div>
                  ) : (
                    matchedTasks.map((task) => (
                      <Card key={task.id} className="border-l-4 border-amber-400 bg-amber-50/30">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start mb-2">
                            <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                              Best Match
                            </span>
                            <span className="text-[10px] font-medium text-slate-400 uppercase">
                              {task.urgency}
                            </span>
                          </div>
                          <CardTitle className="text-lg">{task.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-slate-600">
                            {task.description}
                          </p>
                        </CardContent>
                        <CardFooter>
                          <Button variant="outline" className="w-full">
                            Accept Task
                          </Button>
                        </CardFooter>
                      </Card>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )}

          {(activeSection === 'accepted' || activeSection === 'progress' || activeSection === 'contributions') && (
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
