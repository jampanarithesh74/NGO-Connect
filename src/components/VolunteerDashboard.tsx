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
  Timestamp,
  where,
  limit
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
  Users,
  Play,
  Medal,
  Award,
  TrendingUp,
  Star,
  User,
  Plus,
  X,
  Navigation,
  Upload,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { awardPointsAndBadges } from '@/src/lib/gamification';

import MapComponent from './MapComponent';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type Section = 'home' | 'find' | 'matched' | 'accepted' | 'progress' | 'contributions' | 'leaderboard' | 'badges' | 'map' | 'profile';

interface Task {
  id: string;
  reportId: string;
  ngoId: string;
  volunteerId?: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  urgency: 'Immediate' | 'Soon' | 'Planned';
  status: 'pending' | 'accepted' | 'in-progress' | 'pending_approval' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  proofImageUrl?: string;
  completionNotes?: string;
  rejectionReason?: string;
  location?: {
    lat: number;
    lng: number;
    area: string;
    landmark?: string;
    district: string;
    state: string;
  };
}

interface VolunteerProfile {
  uid: string;
  displayName?: string;
  email: string;
  totalPoints?: number;
  earnedBadges?: { id: string; label: string; earnedAt: string }[];
  skills?: string[];
}

const BADGE_CONFIG = [
  { id: 'first_responder', label: 'First Responder', description: 'Completed your first task!', icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-50' },
  { id: 'high_impact', label: 'High Impact', description: 'Completed 3 High Priority tasks.', icon: Zap, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'community_pillar', label: 'Community Pillar', description: 'Completed 10 total tasks.', icon: Trophy, color: 'text-purple-500', bg: 'bg-purple-50' },
];

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
  const [topVolunteers, setTopVolunteers] = useState<VolunteerProfile[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<VolunteerProfile | null>(null);

  // Photo Verification State
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [submittingTask, setSubmittingTask] = useState<Task | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Fetch top volunteers for leaderboard
  useEffect(() => {
    const q = query(
      collection(db, 'users'), 
      where('role', '==', 'volunteer'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const volunteers = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as VolunteerProfile[];
      
      // Sort in memory to avoid composite index requirements during development
      const sorted = volunteers
        .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
        .slice(0, 10);
        
      setTopVolunteers(sorted);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  // Fetch current user profile for points and badges
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as VolunteerProfile;
        setCurrentUserProfile({ uid: doc.id, ...data });
        if (data.skills) {
          setSelectedSkills(data.skills);
        }
      }
    });
    return () => unsubscribe();
  }, [user?.uid]);

  // Fetch tasks from tasks collection
  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setAllTasks(tasks);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateSkills = async () => {
    if (!user?.uid) return;
    setIsSavingSkills(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        skills: selectedSkills,
        updatedAt: serverTimestamp()
      });
      toast.success("Profile updated successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      toast.error("Failed to update profile");
    } finally {
      setIsSavingSkills(false);
    }
  };

  const handleAddCustomSkill = () => {
    if (!customSkill.trim()) return;
    if (selectedSkills.includes(customSkill.trim())) {
      toast.error("Skill already added");
      return;
    }
    setSelectedSkills([...selectedSkills, customSkill.trim()]);
    setCustomSkill('');
  };

  const handleRemoveSkill = (skill: string) => {
    setSelectedSkills(selectedSkills.filter(s => s !== skill));
  };

  const handleNavigate = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      const updateData: any = {
        status: newStatus,
        updatedAt: serverTimestamp()
      };
      
      if (newStatus === 'accepted') {
        updateData.volunteerId = user?.uid;
      }

      await updateDoc(doc(db, 'tasks', taskId), updateData);
      toast.success(`Task status updated!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image too large. Please select an image under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      // Basic compression: draw to canvas and get smaller dataUrl
      const img = new Image();
      img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setProofImage(dataUrl);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitVerification = async () => {
    if (!submittingTask || !proofImage) {
      toast.error("Please provide a photo as proof of completion.");
      return;
    }

    setIsUploading(true);
    try {
      await updateDoc(doc(db, 'tasks', submittingTask.id), {
        status: 'pending_approval',
        proofImageUrl: proofImage,
        completionNotes: completionNotes,
        updatedAt: serverTimestamp()
      });
      
      toast.success("Task submitted for verification! Point awarding is pending NGO approval.");
      setIsSubmitDialogOpen(false);
      setSubmittingTask(null);
      setProofImage(null);
      setCompletionNotes('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${submittingTask.id}`);
      toast.error("Failed to submit verification.");
    } finally {
      setIsUploading(false);
    }
  };

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
    { id: 'home', label: 'Overview', icon: LayoutDashboard },
    { id: 'find', label: 'Find Needs', icon: Search },
    { id: 'matched', label: 'Matched Tasks', icon: Zap },
    { id: 'map', label: 'Map View', icon: MapPin },
    { id: 'accepted', label: 'Accepted Tasks', icon: BookmarkCheck },
    { id: 'progress', label: 'In Progress Tasks', icon: Clock },
    { id: 'contributions', label: 'Your Contributions', icon: Trophy },
    { id: 'leaderboard', label: 'Leaderboard', icon: Medal },
    { id: 'badges', label: 'My Badges', icon: Award },
    { id: 'profile', label: 'My Profile', icon: User },
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
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8 text-left">
                <h2 className="text-4xl font-bold text-slate-900 mb-2">Welcome back!</h2>
                <p className="text-slate-500 text-lg">You're making a real difference in the community.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <Card className="bg-primary text-primary-foreground shadow-xl border-none overflow-hidden relative group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <Star className="w-24 h-24" />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium opacity-80 uppercase tracking-wider">Total Impact Points</CardTitle>
                    <div className="text-5xl font-bold mt-2">{currentUserProfile?.totalPoints || 0}</div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs opacity-70">Keep completing tasks to climb the leaderboard!</p>
                  </CardContent>
                </Card>

                <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Current Rank</CardTitle>
                    <div className="text-4xl font-bold text-slate-900 mt-2 flex items-baseline gap-2">
                      #{topVolunteers.findIndex(v => v.uid === user?.uid) + 1 || 'N/A'}
                      <span className="text-sm font-normal text-slate-400">Global</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                      <TrendingUp className="w-4 h-4" />
                      <span>Top {Math.max(1, Math.round(((topVolunteers.findIndex(v => v.uid === user?.uid) + 1) / (topVolunteers.length || 1)) * 100))}% of volunteers</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Badges Earned</CardTitle>
                    <div className="text-4xl font-bold text-slate-900 mt-2">
                      {currentUserProfile?.earnedBadges?.length || 0}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex -space-x-2 overflow-hidden">
                      {currentUserProfile?.earnedBadges?.slice(0, 3).map((badge, i) => {
                        const config = BADGE_CONFIG.find(b => b.id === badge.id);
                        const Icon = config?.icon || Award;
                        return (
                          <div key={i} className={`w-8 h-8 rounded-full border-2 border-white ${config?.bg || 'bg-slate-100'} flex items-center justify-center shadow-sm`}>
                            <Icon className={`w-4 h-4 ${config?.color || 'text-slate-500'}`} />
                          </div>
                        );
                      })}
                      {(currentUserProfile?.earnedBadges?.length || 0) > 3 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          +{(currentUserProfile?.earnedBadges?.length || 0) - 3}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white/50 backdrop-blur hover:bg-white transition-colors cursor-pointer group text-left" onClick={() => setActiveSection('find')}>
                  <CardHeader>
                    <Search className="w-8 h-8 text-primary mb-2 group-hover:scale-110 transition-transform" />
                    <CardTitle className="text-lg">Find Needs</CardTitle>
                    <CardDescription>Browse all available tasks from NGOs</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur hover:bg-white transition-colors cursor-pointer group text-left" onClick={() => setActiveSection('matched')}>
                  <CardHeader>
                    <Zap className="w-8 h-8 text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
                    <CardTitle className="text-lg">AI Matching</CardTitle>
                    <CardDescription>Get tasks based on your skills</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur hover:bg-white transition-colors cursor-pointer group text-left" onClick={() => setActiveSection('map')}>
                  <CardHeader>
                    <MapPin className="w-8 h-8 text-green-500 mb-2 group-hover:scale-110 transition-transform" />
                    <CardTitle className="text-lg">Map View</CardTitle>
                    <CardDescription>See nearby tasks on a map</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </motion.div>
          )}

          {activeSection === 'map' && (
            <motion.div
              key="map"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-[calc(100vh-250px)] min-h-[500px] flex flex-col"
            >
              <div className="mb-6 flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <MapPin className="w-8 h-8 text-primary" />
                    Interactive Task Map
                  </h2>
                  <p className="text-slate-500">Find opportunities near you visually.</p>
                </div>
                <Button variant="outline" onClick={() => setActiveSection('find')}>
                  Back to List
                </Button>
              </div>

              <div className="flex-1 relative">
                <MapComponent 
                  markers={allTasks
                    .filter(t => t.status === 'pending' && t.location)
                    .map(t => ({
                      id: t.id,
                      position: [t.location!.lat, t.location!.lng],
                      title: t.title,
                      description: `${t.priority} Priority - ${t.urgency}`,
                      onAcceptTask: (id) => handleUpdateTaskStatus(id, 'accepted'),
                      onNavigate: (lat, lng) => handleNavigate(lat, lng)
                    }))
                  }
                />
                
                <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-lg shadow-lg border border-slate-200 max-w-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Map Legend</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span>Pending Tasks</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Click on a marker to see details and navigate.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <Medal className="w-8 h-8 text-amber-500" />
                  Global Leaderboard
                </h2>
                <p className="text-slate-500">Top volunteers making an impact across the world.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card className="bg-white shadow-md border-l-4 border-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Rank</CardTitle>
                    <div className="text-2xl font-bold text-slate-900">
                      #{topVolunteers.findIndex(v => v.uid === user?.uid) + 1 || 'N/A'}
                    </div>
                  </CardHeader>
                </Card>
                <Card className="bg-white shadow-md border-l-4 border-amber-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Points</CardTitle>
                    <div className="text-2xl font-bold text-slate-900">
                      {currentUserProfile?.totalPoints || 0}
                    </div>
                  </CardHeader>
                </Card>
                <Card className="bg-white shadow-md border-l-4 border-purple-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Badges</CardTitle>
                    <div className="text-2xl font-bold text-slate-900">
                      {currentUserProfile?.earnedBadges?.length || 0}
                    </div>
                  </CardHeader>
                </Card>
              </div>

              <Card className="overflow-hidden border-none shadow-xl">
                <div className="bg-slate-900 text-white p-4 grid grid-cols-12 text-xs font-bold uppercase tracking-widest opacity-70">
                  <div className="col-span-1 text-center">Rank</div>
                  <div className="col-span-7">Volunteer</div>
                  <div className="col-span-2 text-center">Badges</div>
                  <div className="col-span-2 text-right">Points</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {topVolunteers.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                      <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>No volunteers on the leaderboard yet. Be the first!</p>
                    </div>
                  ) : (
                    topVolunteers.map((v, index) => (
                      <div 
                        key={v.uid} 
                        className={`grid grid-cols-12 p-4 items-center transition-colors ${v.uid === user?.uid ? 'bg-primary/5' : 'bg-white hover:bg-slate-50'}`}
                      >
                        <div className="col-span-1 text-center font-mono text-lg font-bold text-slate-400">
                          {index + 1}
                        </div>
                        <div className="col-span-7 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 border-2 border-white shadow-sm">
                            {v.email?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              {v.email?.split('@')[0] || 'Anonymous'}
                              {v.uid === user?.uid && <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">You</span>}
                            </div>
                            <div className="text-xs text-slate-400">{v.earnedBadges?.length || 0} badges earned</div>
                          </div>
                        </div>
                        <div className="col-span-2 flex justify-center -space-x-1">
                          {v.earnedBadges?.slice(0, 3).map((badge, i) => {
                            const config = BADGE_CONFIG.find(b => b.id === badge.id);
                            const Icon = config?.icon || Award;
                            return (
                              <div key={i} className={`w-6 h-6 rounded-full border-2 border-white ${config?.bg || 'bg-slate-100'} flex items-center justify-center shadow-sm`} title={config?.label}>
                                <Icon className={`w-3 h-3 ${config?.color || 'text-slate-500'}`} />
                              </div>
                            );
                          })}
                        </div>
                        <div className="col-span-2 text-right font-mono font-bold text-primary text-xl">
                          {v.totalPoints || 0}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </motion.div>
          )}

          {activeSection === 'badges' && (
            <motion.div
              key="badges"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <Award className="w-8 h-8 text-primary" />
                  Badge Gallery
                </h2>
                <p className="text-slate-500">Milestones you've achieved through your service.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {BADGE_CONFIG.map((badge) => {
                  const isEarned = currentUserProfile?.earnedBadges?.find(b => b.id === badge.id);
                  const Icon = badge.icon;
                  return (
                    <Card key={badge.id} className={`relative overflow-hidden transition-all duration-500 ${isEarned ? 'border-primary/20 shadow-lg scale-100' : 'opacity-40 grayscale scale-95 bg-slate-50/50'}`}>
                      {isEarned && (
                        <div className="absolute top-0 right-0 p-2">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        </div>
                      )}
                      <CardHeader className="text-center pb-2">
                        <div className={`mx-auto w-20 h-20 rounded-2xl ${isEarned ? badge.bg : 'bg-slate-200'} flex items-center justify-center mb-4 shadow-inner rotate-3 group-hover:rotate-0 transition-transform`}>
                          <Icon className={`w-10 h-10 ${isEarned ? badge.color : 'text-slate-400'}`} />
                        </div>
                        <CardTitle className="text-xl">{badge.label}</CardTitle>
                        <CardDescription className="text-xs mt-1">{badge.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="text-center pt-0">
                        {isEarned ? (
                          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-4">
                            Earned on {new Date(isEarned.earnedAt).toLocaleDateString()}
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-4">
                            Locked
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
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
                {allTasks.filter(t => t.status === 'pending').map((task) => (
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
                    <CardFooter className="pt-0 flex flex-col gap-3">
                      <div className="flex items-center text-[10px] text-slate-400 gap-2">
                        <Calendar className="w-3 h-3" />
                        {task.createdAt?.toDate().toLocaleDateString()}
                      </div>
                      <Button variant="outline" className="w-full" onClick={() => handleUpdateTaskStatus(task.id, 'accepted')}>
                        Accept Task
                      </Button>
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
                  {matchedTasks.filter(t => t.status === 'pending').length === 0 ? (
                    <div className="col-span-full py-20 text-center text-slate-400">
                      <p>No direct matches found. Try adding more skills to your profile!</p>
                    </div>
                  ) : (
                    matchedTasks.filter(t => t.status === 'pending').map((task) => (
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
                          <Button variant="outline" className="w-full" onClick={() => handleUpdateTaskStatus(task.id, 'accepted')}>
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
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900">
                  {activeSection === 'accepted' ? 'Accepted Tasks' : 
                   activeSection === 'progress' ? 'In Progress Tasks' : 'Your Contributions'}
                </h2>
                <p className="text-slate-500">
                  {activeSection === 'accepted' ? 'Tasks you have committed to help with.' : 
                   activeSection === 'progress' ? 'Tasks you are currently working on.' : 
                   'A summary of your positive impact.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allTasks.filter(t => t.volunteerId === user?.uid && (
                  activeSection === 'accepted' ? t.status === 'accepted' : 
                  activeSection === 'progress' ? t.status === 'in-progress' : 
                  (t.status === 'completed' || t.status === 'pending_approval')
                )).length === 0 ? (
                  <div className="col-span-full py-20 text-center text-slate-400">
                    <p>No tasks found in this section.</p>
                  </div>
                ) : (
                  allTasks
                    .filter(t => t.volunteerId === user?.uid && (
                      activeSection === 'accepted' ? t.status === 'accepted' : 
                      activeSection === 'progress' ? t.status === 'in-progress' : 
                      (t.status === 'completed' || t.status === 'pending_approval')
                    ))
                    .map((task) => (
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
                          <p className="text-sm text-slate-600">
                            {task.description}
                          </p>
                          {task.rejectionReason && task.status === 'in-progress' && (
                            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg flex gap-2 items-start shrink-0">
                              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold text-red-700 uppercase">Revision Requested:</p>
                                <p className="text-[11px] text-red-600 line-clamp-3 leading-relaxed">{task.rejectionReason}</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                          {task.status === 'accepted' && (
                            <div className="w-full flex gap-2">
                              <Button className="flex-1" onClick={() => handleUpdateTaskStatus(task.id, 'in-progress')}>
                                <Play className="w-4 h-4 mr-2" />
                                Start Task
                              </Button>
                              {task.location && (
                                <Button variant="outline" onClick={() => handleNavigate(task.location!.lat, task.location!.lng)}>
                                  <Navigation className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          )}
                          {task.status === 'in-progress' && (
                            <div className="w-full flex gap-2">
                              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => {
                                setSubmittingTask(task);
                                setIsSubmitDialogOpen(true);
                              }}>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Complete Task
                              </Button>
                              {task.location && (
                                <Button variant="outline" onClick={() => handleNavigate(task.location!.lat, task.location!.lng)}>
                                  <Navigation className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          )}
                          {task.status === 'pending_approval' && (
                            <div className="w-full space-y-2">
                              <div className="flex items-center justify-center gap-2 text-amber-600 font-medium bg-amber-50 py-2 rounded">
                                <Clock className="w-4 h-4" />
                                Pending NGO Approval
                              </div>
                              <p className="text-[10px] text-slate-400 text-center italic">
                                Your points will be awarded once the NGO verifies your photo proof.
                              </p>
                            </div>
                          )}
                          {task.status === 'completed' && (
                            <div className="w-full flex items-center justify-center gap-2 text-green-600 font-medium bg-green-50 py-2 rounded">
                              <Trophy className="w-4 h-4" />
                              Task Completed!
                            </div>
                          )}
                        </CardFooter>
                      </Card>
                    ))
                )}
              </div>
            </motion.div>
          )}
          {activeSection === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-3xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <User className="w-8 h-8 text-primary" />
                  Your Profile
                </h2>
                <p className="text-slate-500">Manage your skills and personal information.</p>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Account Information</CardTitle>
                    <CardDescription>Basic details about your volunteer account.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400 uppercase">Email Address</Label>
                        <p className="font-medium">{user?.email}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400 uppercase">Account Type</Label>
                        <p className="font-medium">Volunteer</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Your Skills</CardTitle>
                    <CardDescription>Update your skills to get better task recommendations.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <Label>Select from common skills</Label>
                      <div className="flex flex-wrap gap-2">
                        {PREDEFINED_SKILLS.map((skill) => (
                          <button
                            key={skill.id}
                            onClick={() => {
                              if (selectedSkills.includes(skill.label)) {
                                setSelectedSkills(selectedSkills.filter(s => s !== skill.label));
                              } else {
                                setSelectedSkills([...selectedSkills, skill.label]);
                              }
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
                              selectedSkills.includes(skill.label)
                                ? 'bg-primary border-primary text-primary-foreground shadow-md'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-primary/50'
                            }`}
                          >
                            <skill.icon className="w-4 h-4" />
                            {skill.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <Label>Add custom skills</Label>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="e.g., Graphic Design, Translation..." 
                          value={customSkill}
                          onChange={(e) => setCustomSkill(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSkill()}
                        />
                        <Button onClick={handleAddCustomSkill} variant="secondary">
                          <Plus className="w-4 h-4 mr-2" />
                          Add
                        </Button>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedSkills.filter(s => !PREDEFINED_SKILLS.some(ps => ps.label === s)).map((skill) => (
                          <div key={skill} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm">
                            {skill}
                            <button onClick={() => handleRemoveSkill(skill)} className="hover:text-red-500">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="bg-slate-50/50 border-t p-6">
                    <Button 
                      className="w-full" 
                      onClick={handleUpdateSkills}
                      disabled={isSavingSkills}
                    >
                      {isSavingSkills ? "Saving Changes..." : "Save Profile Changes"}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Verify Completion</DialogTitle>
            <DialogDescription>
              Upload a photo as proof of work done and add any final notes for the NGO.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Photo Proof (Required)</Label>
              <div 
                className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer overflow-hidden relative ${
                  proofImage ? 'border-green-500 bg-green-50/10' : 'border-slate-200 hover:border-primary/50 hover:bg-slate-50'
                }`}
                onClick={() => document.getElementById('photo-upload')?.click()}
              >
                {proofImage ? (
                  <img src={proofImage} alt="Proof" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-300" />
                    <span className="text-sm text-slate-400">Click to upload or take photo</span>
                    <span className="text-[10px] text-slate-300 uppercase font-bold tracking-widest">JPG/PNG, max 2MB</span>
                  </>
                )}
                <input 
                  id="photo-upload" 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleImageUpload} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Completion Notes</Label>
              <Textarea 
                placeholder="Briefly describe what was accomplished..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitVerification} 
              disabled={isUploading || !proofImage}
              className="px-8"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : "Submit for Verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
